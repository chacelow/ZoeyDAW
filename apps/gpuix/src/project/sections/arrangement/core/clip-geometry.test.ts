import { expect, it } from "bun:test"
import { createMockDocument } from "../../../adapters/fixtures"
import { clipVisualGeometry } from "./clip-geometry"
import { clipRect, layoutTrackRows } from "./layout"
import { createSceneStore } from "./scene"

it.each([0.1, 0.5, 0.9])(
  "keeps flat ends and a continuous, directional tangent at position %s",
  position => {
    const score = createMockDocument()
    const track = score.tracks.find(track => track.id === "3-audio")!
    const clip = track.clips[0]
    if (clip.kind !== "audio") {
      throw new Error("Missing audio fixture")
    }
    clip.fadeInBars = 3
    clip.fadeOutBars = 3
    clip.fadeInCurvePosition = position
    clip.fadeOutCurvePosition = position
    const scene = createSceneStore()
    scene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 1 },
      transport: score.transport,
      tracks: score.tracks,
      markers: score.markers,
      loop: score.transport.loop,
    })
    scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 900, height: 700, dpr: 1 })
    const row = layoutTrackRows(scene.get()).find(row => row.track.id === track.id)!
    for (const bend of [-1, 0, 0.35, 1]) {
      clip.fadeInCurve = bend
      clip.fadeOutCurve = bend
      const geometry = clipVisualGeometry(clipRect(clip, row, 32, 0), clip, track, true)
      for (const fade of geometry.fades) {
        expect(Math.min(fade.start.y, fade.end.y)).toBe(geometry.bodyTop)
        expect(Math.max(fade.start.y, fade.end.y)).toBe(geometry.bodyTop + geometry.bodyHeight)
        expect(fade.segments[0].control1.y).toBe(fade.start.y)
        expect(fade.segments.at(-1)!.control2.y).toBe(fade.end.y)
        expect(fade.curve.x).toBeCloseTo(fade.start.x + (fade.end.x - fade.start.x) * position)
        expect(fade.curve.y).toBeGreaterThan(geometry.bodyTop)
        expect(fade.curve.y).toBeLessThan(geometry.bodyTop + geometry.bodyHeight)
        expect(
          fade.segments.some(
            segment =>
              Math.abs(segment.end.x - fade.curve.x) < 1e-8 &&
              Math.abs(segment.end.y - fade.curve.y) < 1e-8
          )
        ).toBe(true)
        const sample = (a: number, b: number, c: number, d: number, t: number) =>
          (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
        let { start } = fade
        let previous = start.y
        let previousSlope = 0
        for (const segment of fade.segments) {
          const incomingSlope = (segment.control1.y - start.y) / (segment.control1.x - start.x)
          expect(incomingSlope).toBeCloseTo(previousSlope, 7)
          for (let step = 1; step <= 20; step++) {
            const y = sample(
              start.y,
              segment.control1.y,
              segment.control2.y,
              segment.end.y,
              step / 20
            )
            if (fade.edge === "in") {
              expect(y).toBeLessThanOrEqual(previous + 1e-8)
            } else {
              expect(y).toBeGreaterThanOrEqual(previous - 1e-8)
            }
            expect(y).toBeGreaterThanOrEqual(geometry.bodyTop - 1e-8)
            expect(y).toBeLessThanOrEqual(geometry.bodyTop + geometry.bodyHeight + 1e-8)
            previous = y
          }
          previousSlope =
            (segment.end.y - segment.control2.y) / (segment.end.x - segment.control2.x)
          start = segment.end
        }
        expect(previousSlope).toBeCloseTo(0)
        expect(start).toEqual(fade.end)
      }
    }
  }
)
