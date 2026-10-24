import { describe, expect, it } from "vitest"
import { waveformRangeRequests } from "./waveform-ranges"
import type { SourceWaveformRangeRequest } from "./waveform-ranges"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { PeakEnvelope } from "@zoeydaw/project-core/waveform"

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
