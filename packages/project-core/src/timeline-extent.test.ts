import { describe, expect, it } from "vitest"
import { createTestDocument } from "./test-fixtures"
import { growTimelineBars, timelineBars } from "./selectors"

describe("native song extent", () => {
  it("keeps the minimum song length with 32 quarter notes of trailing space", () => {
    expect(timelineBars(createTestDocument())).toBe(58)
    expect(growTimelineBars(58, 133)).toBe(140)
    expect(growTimelineBars(140, 129)).toBe(140)
    expect(growTimelineBars(140, 121)).toBe(128)
  })
  it("uses the time signature when converting the native quarter-note range", () => {
    const document = createTestDocument()
    document.transport.numerator = 3
    document.transport.denominator = 8
    expect(timelineBars(document)).toBeCloseTo(232 / 1.5)
  })
  it("includes clip ends inside collapsed groups", () => {
    const document = createTestDocument()
    document.tracks.find(track => track.id === "drums-group")!.collapsed = true
    const track = document.tracks.find(track => track.id === "trager")!
    track.clips[0] = { ...track.clips[0], startBar: 129, lengthBars: 4 }
    expect(timelineBars(document)).toBe(140)
  })
  it("includes marker, loop and automation endpoints regardless of visibility", () => {
    const document = createTestDocument()
    document.markers.push({ id: "far", label: "Far", bar: 10000 })
    document.transport.loop.endBar = 10050
    document.tracks[0].automation.push({
      id: "auto",
      target: { kind: "mixer", parameter: "volume" },
      points: [{ id: "last", bar: 10100, value: 0.5 }],
    })
    expect(timelineBars(document)).toBe(10107)
    document.tracks[0].automation = []
    expect(timelineBars(document)).toBe(10057)
    document.transport.loop.endBar = 17
    expect(timelineBars(document)).toBe(10007)
  })
  it("caps song extent at the native maximum", () => {
    const document = createTestDocument()
    document.tracks.find(track => track.id === "trager")!.clips[0].lengthBars = 10000000
    expect(timelineBars(document)).toBe(3942000)
  })
})
