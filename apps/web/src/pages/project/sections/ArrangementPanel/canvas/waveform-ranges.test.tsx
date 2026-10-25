// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaSource, Track } from "@zoeydaw/project-core/types"
import type { WaveformRange, WaveformRangeRequest } from "@zoeydaw/project-core/waveform-range"
import {
  signedWaveformPaths,
  signedWaveformPreviewPaths,
} from "@zoeydaw/project-core/signed-waveform"
import {
  cachedWaveformRanges,
  releaseWaveformRangeDemand,
  useWaveformRanges,
  waveformRangeRequestKey,
} from "@/pages/project/adapters/backend/waveform-ranges"
import { arrangementScene, createSceneStore } from "./scene"
import { arrangementWaveformRangeRequests, useArrangementWaveformRanges } from "./waveform-ranges"

const native = vi.hoisted(() => ({
  read: vi.fn<(request: WaveformRangeRequest) => Promise<WaveformRange>>(),
  cancel: vi.fn<() => Promise<void>>(),
}))
vi.mock("@/shared/native/audio", () => ({
  nativeAudio: { available: () => true },
  readNativeWaveformRange: native.read,
  cancelNativeWaveformRanges: native.cancel,
}))

const source: MediaSource = {
  id: "navigation-take",
  name: "take.wav",
  sha256: "a".repeat(64),
  byteLength: 19_200_000,
  frames: 4_800_000,
  sampleRate: 48_000,
  channels: 1,
  location: { kind: "external", path: "/audio/navigation-take.wav" },
}
const track: Track = {
  id: "audio",
  name: "Audio",
  kind: "audio",
  color: "#888888",
  solo: false,
  armed: false,
  mute: false,
  volumeDb: 0,
  pan: 0,
  input: "none",
  output: "main",
  monitor: "off",
  heightPx: 100,
  automation: [],
  clips: [
    { id: "take", kind: "audio", sourceId: source.id, startBar: 1, lengthBars: 50, gainDb: 0 },
  ],
}
const pending: {
  request: WaveformRangeRequest
  resolve: (data: WaveformRange) => void
  reject: (error: Error) => void
}[] = []

function makeScene(scrollX = 10_000, scrollY = 0, tracks = [track]) {
  const store = createSceneStore()
  store.setViewport({ width: 1000, height: 269, pxPerBar: 96_000, scrollX, scrollY, dpr: 1 })
  store.setMusic({
    bars: 64,
    grid: { mode: "fixed", bars: 1 },
    transport: { bpm: 120, numerator: 4, denominator: 4 },
    markers: [],
    loop: { enabled: false, startBar: 1, endBar: 5 },
    tracks,
    media: [source],
    patterns: [],
  })
  return store.get()
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 12; index++) await Promise.resolve()
  })
}

beforeEach(() => {
  native.read.mockReset()
  native.cancel.mockReset()
  native.read.mockImplementation(
    request =>
      new Promise<WaveformRange>((resolve, reject) => {
        pending.push({ request, resolve, reject })
      })
  )
  native.cancel.mockImplementation(async () => {
    for (const item of pending.splice(0)) item.reject(new Error("Canceled waveform range"))
  })
  useWaveformRanges.setState({ entries: new Map() })
})
afterEach(async () => {
  cleanup()
  releaseWaveformRangeDemand("arrangement")
  await flush()
  for (const item of pending.splice(0)) item.reject(new Error("Test teardown"))
  await flush()
  useWaveformRanges.setState({ entries: new Map() })
})

describe("navigation waveform warm ranges", () => {
  it("preloads one horizontal viewport on each side in source-aligned bounded chunks", () => {
    const requests = arrangementWaveformRangeRequests(makeScene(16_000))
    const detail = requests.filter(({ request }) => request.framesPerBin === 1)
    expect(Math.min(...detail.map(({ request }) => request.startFrame))).toBeLessThanOrEqual(15_000)
    expect(
      Math.max(...detail.map(({ request }) => request.startFrame + request.frameCount))
    ).toBeGreaterThanOrEqual(18_000)
    for (const { request } of requests) {
      expect(request.columns).toBeLessThanOrEqual(4096)
      expect(request.frameCount).toBeLessThanOrEqual(
        request.framesPerBin === 1 ? 8192 : request.framesPerBin * 4096
      )
      expect(request.startFrame + request.frameCount).toBeLessThanOrEqual(source.frames)
      if (request.framesPerBin === 1) expect(request.startFrame % 8192).toBe(0)
    }
    const overview = requests.find(({ request }) => request.frameCount === source.frames)!
    expect(overview.request.framesPerBin).toBeGreaterThan(1)
    expect(overview.request.columns).toBeLessThanOrEqual(4096)
  })

  it("clamps the first and last prefetch chunks to the source without full-file PCM", () => {
    for (const scrollX of [0, source.frames - 400]) {
      const detail = arrangementWaveformRangeRequests(makeScene(scrollX)).filter(
        ({ request }) => request.framesPerBin === 1
      )
      expect(detail.length).toBeGreaterThan(0)
      for (const { request } of detail) {
        expect(request.startFrame).toBeGreaterThanOrEqual(0)
        expect(request.startFrame + request.frameCount).toBeLessThanOrEqual(source.frames)
        expect(request.frameCount).toBeLessThanOrEqual(8192)
        expect(request.frameCount).toBeLessThan(source.frames)
      }
    }
  })

  it("keeps request identity stable for pixel pans inside the prefetched chunk", () => {
    const keys = arrangementWaveformRangeRequests(makeScene()).map(waveformRangeRequestKey)
    for (const pixel of [1, 2, 17, 127])
      expect(
        arrangementWaveformRangeRequests(makeScene(10_000 + pixel)).map(waveformRangeRequestKey)
      ).toEqual(keys)
  })

  it("warms one vertical viewport without demanding all offscreen tracks", () => {
    const tracks = Array.from({ length: 8 }, (_, index) => ({
      ...track,
      id: `audio-${index}`,
      clips: [{ ...track.clips[0], sourceId: `source-${index}` }],
    }))
    const scene = makeScene(10_000, 200, tracks)
    const media = tracks.map((_, index) => ({ ...source, id: `source-${index}` }))
    const keys = new Set(
      arrangementWaveformRangeRequests({ ...scene, media }).map(
        item => item.sourceKey.split("/")[0]
      )
    )
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual([
      "source-0",
      "source-1",
      "source-2",
      "source-3",
      "source-4",
      "source-5",
    ])
  })

  it("finishes useful in-flight tiles across moving windows, retains them, and cancels on unmount", async () => {
    const scene = makeScene()
    arrangementScene.setMusic(scene)
    arrangementScene.setViewport(scene.viewport)
    const hook = renderHook(useArrangementWaveformRanges)
    await flush()
    expect(pending).toHaveLength(1)
    const first = pending.shift()!
    act(() => arrangementScene.setViewport({ ...scene.viewport, scrollX: 200_000 }))
    await flush()
    expect(native.cancel).not.toHaveBeenCalled()
    const data: WaveformRange = {
      kind: "samples",
      sampleRate: source.sampleRate,
      totalFrames: source.frames,
      startFrame: first.request.startFrame,
      frameCount: first.request.frameCount,
      channels: [
        Array.from({ length: first.request.frameCount }, (_, index) => Math.sin(index / 7) * 0.5),
      ],
    }
    first.resolve(data)
    await flush()
    expect(cachedWaveformRanges(source).some(item => item.data === data)).toBe(true)
    expect(pending).toHaveLength(1)
    hook.unmount()
    await flush()
    expect(native.cancel).toHaveBeenCalledTimes(1)
    expect(cachedWaveformRanges(source).some(item => item.data === data)).toBe(true)
    const calls = native.read.mock.calls.length
    act(() => arrangementScene.setViewport({ ...scene.viewport, scrollX: 300_000 }))
    await flush()
    expect(native.read).toHaveBeenCalledTimes(calls)
  })
})

describe("explicit coarse cached waveform fallback", () => {
  const envelope = { peaks: [], start: 0, span: 1 }
  const overview: WaveformRange = {
    kind: "envelope",
    totalFrames: 8192,
    sampleRate: 48000,
    startFrame: 0,
    frameCount: 8192,
    framesPerBin: 16,
    channels: [{ min: Array(512).fill(-0.4), max: Array(512).fill(0.7) }],
  }
  const detail: WaveformRange = {
    kind: "samples",
    totalFrames: 8192,
    sampleRate: 48000,
    startFrame: 2048,
    frameCount: 4096,
    channels: [Array.from({ length: 4096 }, (_, index) => Math.sin(index / 9) * 0.2)],
  }

  it("uses real coarse envelopes only for missing detail, without pretending they are PCM", () => {
    const slices = signedWaveformPreviewPaths(envelope, [detail, overview], 8192, 0, 1, 8192, 60)
    expect(
      slices.some(slice => slice.scaleX > 1 && slice.paths.some(path => path.kind === "envelope"))
    ).toBe(true)
    expect(
      slices.some(slice => slice.scaleX === 1 && slice.paths.some(path => path.kind === "samples"))
    ).toBe(true)
    for (const slice of slices.filter(slice => slice.scaleX > 1)) {
      expect(slice.paths.every(path => path.kind === "envelope" && !path.markers)).toBe(true)
      expect(slice.left === 0 || slice.left >= 6112).toBe(true)
    }
    expect(slices.filter(slice => slice.scaleX > 1).map(slice => slice.left)).toEqual([0, 6112])
    expect(signedWaveformPaths(envelope, [overview], 8192, 0, 1, 8192, 60)).toEqual([])
  })

  it("keeps the exact reference algorithm when detail coverage is complete", () => {
    const complete: WaveformRange = {
      ...detail,
      startFrame: 0,
      frameCount: 8192,
      channels: [Array(8192).fill(0.25)],
    }
    expect(
      signedWaveformPreviewPaths(envelope, [complete, overview], 8192, 0, 1, 8192, 60)
    ).toEqual([
      {
        left: 0,
        scaleX: 1,
        paths: signedWaveformPaths(envelope, [complete, overview], 8192, 0, 1, 8192, 60),
      },
    ])
    expect(signedWaveformPreviewPaths(envelope, [], 8192, 0, 1, 8192, 60)).toEqual([])
  })
})
