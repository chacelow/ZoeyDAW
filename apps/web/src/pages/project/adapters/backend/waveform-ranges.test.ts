import { afterEach, describe, expect, it, vi } from "vitest"
import { nativeAudio } from "@/shared/native/audio"
import {
  browserWaveformMetadataRequest,
  cachedWaveformRanges,
  sourceWaveformKey,
  releaseWaveformRangeDemand,
  setWaveformRangeDemand,
  useWaveformRanges,
  waveformRangeRequestKey,
  waveformRangeRequests,
} from "./waveform-ranges"
import type { SourceWaveformRangeRequest } from "./waveform-ranges"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { PeakEnvelope } from "@zoeydaw/project-core/waveform"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"

const source: MediaSource = {
  id: "take",
  name: "take.wav",
  sha256: "a".repeat(64),
  byteLength: 384000,
  frames: 96000,
  sampleRate: 48000,
  channels: 2,
  location: { kind: "external", path: "/audio/take.wav" },
}
const envelope: PeakEnvelope = { peaks: [], start: 0, span: 2 }

describe("visible source waveform requests", () => {
  function assertBounded(requests: readonly SourceWaveformRangeRequest[]) {
    for (const { request } of requests) {
      expect(Number.isInteger(Math.log2(request.framesPerBin))).toBe(true)
      expect(request.startFrame % request.framesPerBin).toBe(0)
      expect(request.frameCount).toBeLessThanOrEqual(
        request.framesPerBin === 1 ? 8192 : request.framesPerBin * 4096
      )
      expect(request.columns).toBeLessThanOrEqual(4096)
      expect(request.startFrame + request.frameCount).toBeLessThanOrEqual(source.frames)
    }
  }

  it("pads a visible sample window for reconstruction without reading whole-file PCM", () => {
    const ranges = waveformRangeRequests(source, envelope, 0.5, 0.501, 500)
    assertBounded(ranges)
    const { request } = ranges[0]
    expect(request.framesPerBin).toBe(1)
    expect(request.startFrame).toBe(24000 - 32)
    expect(request.startFrame + request.frameCount).toBeGreaterThanOrEqual(24048 + 32)
    expect(request.frameCount).toBeLessThan(source.frames)
  })

  it("chunks raw samples and uses aligned bounded envelopes at far zoom", () => {
    const raw = waveformRangeRequests(source, envelope, 0, 2, 1_000_000)
    assertBounded(raw)
    expect(raw.length).toBeGreaterThan(1)
    expect(raw.every(({ request }) => request.framesPerBin === 1)).toBe(true)
    const ranges = waveformRangeRequests(
      source,
      { ...envelope, window: { start: 0.25, end: 1.75 } },
      -10,
      10,
      300
    )
    assertBounded(ranges)
    expect(ranges[0].request.framesPerBin).toBeGreaterThan(1)
    expect(ranges[0].request.startFrame).toBeLessThanOrEqual(12000)
    const last = ranges.at(-1)!
    expect(last.request.startFrame + last.request.frameCount).toBeGreaterThanOrEqual(84000)
    expect(waveformRangeRequests(source, envelope, 3, 4, 500)).toEqual([])
  })

  it("keeps sample detail and source bounds for a stretched Warp interval", () => {
    const ranges = waveformRangeRequests(
      source,
      { ...envelope, warpMarkers: [{ id: "a", sourceBar: 0.1, targetBar: 1 }] },
      0.25,
      0.26,
      100
    )
    assertBounded(ranges)
    expect(ranges.every(({ request }) => request.framesPerBin === 1)).toBe(true)
    expect(ranges[0].request.startFrame).toBeLessThanOrEqual(1200)
    const last = ranges.at(-1)
    if (!last) throw new Error("Missing stretched source window")
    expect(last.request.startFrame + last.request.frameCount).toBeGreaterThanOrEqual(1248)
  })

  it("maps reverse windows to the original file and splits nonzero loop seams", () => {
    const reversed = waveformRangeRequests(source, { ...envelope, reverse: true }, 0.5, 1, 300)
    assertBounded(reversed)
    expect(reversed[0].request.startFrame).toBeLessThanOrEqual(48000)
    const reverseEnd = reversed.at(-1)!.request
    expect(reverseEnd.startFrame + reverseEnd.frameCount).toBeGreaterThanOrEqual(72000)
    const loops = waveformRangeRequests(
      source,
      { ...envelope, loop: { start: 0.5, end: 1.5 } },
      1.25,
      1.75,
      300
    )
    assertBounded(loops)
    expect(loops).toHaveLength(2)
    for (const [index, [first, end]] of [
      [60000, 72000],
      [24000, 36000],
    ].entries()) {
      expect(loops[index].request.startFrame).toBeLessThanOrEqual(first)
      expect(
        loops[index].request.startFrame + loops[index].request.frameCount
      ).toBeGreaterThanOrEqual(end)
    }
    const cycles = waveformRangeRequests(
      source,
      { ...envelope, loop: { start: 0.5, end: 1.5 } },
      -100,
      100,
      300
    )
    assertBounded(cycles)
    expect(cycles[0].request.startFrame).toBeLessThanOrEqual(24000)
    const cycleEnd = cycles.at(-1)!.request
    expect(cycleEnd.startFrame + cycleEnd.frameCount).toBeGreaterThanOrEqual(72000)
  })
})

describe("Browser waveform source handoff", () => {
  afterEach(() => useWaveformRanges.setState({ entries: new Map() }))

  const data: WaveformRange = {
    kind: "samples",
    sampleRate: 48000,
    totalFrames: 96000,
    startFrame: 12000,
    frameCount: 4,
    channels: [
      [-0.5, 0.25, -0.1, 0.8],
      [-0.2, 0.4, -0.7, 0.1],
    ],
  }

  function seedBrowserRange() {
    const metadataRequest = browserWaveformMetadataRequest("/audio/take.wav")
    const request = {
      sourceKey: metadataRequest.sourceKey,
      request: { ...metadataRequest.request, startFrame: 12000, frameCount: 4, columns: 2 },
    }
    useWaveformRanges.setState({
      entries: new Map([
        [
          waveformRangeRequestKey(request),
          {
            kind: "ready",
            range: { sourceKey: request.sourceKey, data },
          },
        ],
      ]),
    })
  }
  it("does not relabel path-only Browser samples as either version of changed file content", () => {
    seedBrowserRange()
    const changed = { ...source, sha256: "b".repeat(64) }
    expect(cachedWaveformRanges(source)).toEqual([])
    expect(cachedWaveformRanges(changed)).toEqual([])
  })

  it("keeps fingerprinted source data separate from matching path-only preview samples", () => {
    seedBrowserRange()
    const sourceKey = sourceWaveformKey(source)
    const entries = new Map(useWaveformRanges.getState().entries)
    entries.set("verified-range", { kind: "ready", range: { sourceKey, data } })
    useWaveformRanges.setState({ entries })
    expect(cachedWaveformRanges(source)).toEqual([{ sourceKey, data }])
    expect(cachedWaveformRanges({ ...source, sha256: "b".repeat(64) })).toEqual([])
    expect(cachedWaveformRanges(source)[0].data).toBe(data)
  })
})

describe("waveform cache payload budget", () => {
  afterEach(async () => {
    releaseWaveformRangeDemand("budget-visible")
    await Promise.resolve()
    useWaveformRanges.setState({ entries: new Map() })
    vi.restoreAllMocks()
  })

  function largeRanges(kind: WaveformRange["kind"] = "samples") {
    const entries = new Map(useWaveformRanges.getState().entries)
    const requests: SourceWaveformRangeRequest[] = []
    const wideSource = { ...source, channels: 64 }
    for (let index = 0; index < 9; index++) {
      const item = {
        sourceKey: sourceWaveformKey(wideSource),
        request: {
          path: "/audio/take.wav",
          startFrame: index * 8192,
          frameCount: 8192,
          framesPerBin: kind === "samples" ? 1 : 2,
          columns: 4096,
        },
      }
      const coordinates = {
        sampleRate: 48000,
        totalFrames: 96000,
        startFrame: item.request.startFrame,
        frameCount: 8192,
      }
      const data: WaveformRange =
        kind === "samples"
          ? {
              ...coordinates,
              kind,
              channels: Array.from({ length: 64 }, () => Array<number>(8192).fill(0.25)),
            }
          : {
              ...coordinates,
              kind,
              framesPerBin: 2,
              channels: Array.from({ length: 64 }, () => ({
                min: Array<number>(4096).fill(-0.25),
                max: Array<number>(4096).fill(0.25),
              })),
            }
      entries.set(waveformRangeRequestKey(item), {
        kind: "ready",
        range: { sourceKey: item.sourceKey, data },
      })
      requests.push(item)
    }
    return { entries, requests }
  }

  it("evicts old unused payload below the entry limit while retaining visible and aliased data", async () => {
    vi.spyOn(nativeAudio, "available").mockReturnValue(true)
    const { entries, requests } = largeRanges("envelope")
    const visibleKey = waveformRangeRequestKey(requests[0])
    const visible = entries.get(visibleKey)!
    entries.set("browser-alias", { ...visible })
    useWaveformRanges.setState({ entries })
    setWaveformRangeDemand("budget-visible", [requests[0]])
    await Promise.resolve()
    const cached = useWaveformRanges.getState().entries
    expect(cached.get(visibleKey)).toBe(visible)
    expect(cached.get("browser-alias")).toBe(entries.get("browser-alias"))
    expect(cached.has(waveformRangeRequestKey(requests[1]))).toBe(false)
    expect(cached.get(waveformRangeRequestKey(requests[2]))).toBe(
      entries.get(waveformRangeRequestKey(requests[2]))
    )
    expect(cached.get(waveformRangeRequestKey(requests[8]))).toBe(
      entries.get(waveformRangeRequestKey(requests[8]))
    )
  })

  it("keeps demanded ranges over budget and trims after their final consumer releases them", async () => {
    vi.spyOn(nativeAudio, "available").mockReturnValue(true)
    const { entries, requests } = largeRanges()
    useWaveformRanges.setState({ entries })
    setWaveformRangeDemand("budget-visible", requests)
    await Promise.resolve()
    expect(useWaveformRanges.getState().entries).toBe(entries)
    releaseWaveformRangeDemand("budget-visible")
    await Promise.resolve()
    const cached = useWaveformRanges.getState().entries
    expect(cached.has(waveformRangeRequestKey(requests[0]))).toBe(false)
    expect(cached.get(waveformRangeRequestKey(requests[8]))).toBe(
      entries.get(waveformRangeRequestKey(requests[8]))
    )
  })
})
