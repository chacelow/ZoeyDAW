import { describe, expect, it } from "vitest"
import { timelineZoomLimit } from "./timeline-zoom"
import { gridZoomLimit } from "./grid"
import type { MediaSource } from "./media"

function source(sampleRate: number): MediaSource {
  return {
    id: `source-${sampleRate}`,
    name: "Zoom fixture",
    sha256: "",
    byteLength: 0,
    sampleRate,
    frames: sampleRate,
    channels: 2,
    location: { kind: "fixture", uri: "mock://zoom" },
  }
}

describe("sample-level timeline zoom", () => {
  it.each([
    [120, 4, 4, 48_000],
    [140, 4, 4, 44_100],
    [75, 7, 8, 96_000],
  ])(
    "separates source samples at %s BPM in %s/%s at %s Hz",
    (bpm, numerator, denominator, rate) => {
      const transport = { bpm, numerator, denominator }
      const samplesPerBar = (rate * 240 * numerator) / (bpm * denominator)
      expect(timelineZoomLimit(transport, [source(rate)]) / samplesPerBar).toBeCloseTo(32)
    }
  )

  it("allows inspecting the highest-rate source without reducing musical zoom in empty projects", () => {
    const transport = { bpm: 120, numerator: 4, denominator: 4 }
    expect(timelineZoomLimit(transport, [source(44_100), source(192_000)])).toBe(32 * 192_000 * 2)
    expect(timelineZoomLimit(transport, [])).toBe(gridZoomLimit(4, 4))
  })
})
