import { describe, expect, it } from "vitest"
import { createMockDocument } from "../adapters/fixtures"
import { growTimelineBars, timelineBars } from "./selectors"

describe("derived timeline extent", () => {
  it("keeps the demo at the minimum and grows in 16-bar regions with trailing room", () => {
    expect(timelineBars(createMockDocument())).toBe(128)
    expect(growTimelineBars(128, 133)).toBe(160)
    expect(growTimelineBars(160, 129)).toBe(160)
    expect(growTimelineBars(128, 129)).toBe(144)
  })

  it("includes full clip ends even when their group is collapsed", () => {
    const document = createMockDocument()
    document.tracks.find(track => track.id === "drums-group")!.collapsed = true
    document.tracks.find(track => track.id === "trager")!.clips[0] = {
      ...document.tracks.find(track => track.id === "trager")!.clips[0],
      startBar: 129,
      lengthBars: 4,
    }
    expect(timelineBars(document)).toBe(160)
    expect(document.tracks.find(track => track.id === "trager")!.clips[0].id).toBe("trager-1")
  })

  it("includes markers, loop ends, and every automation lane regardless of visibility", () => {
    const document = createMockDocument()
    document.markers.push({ id: "far", label: "Far", bar: 10_000 })
    document.transport.loop.endBar = 10_050
    document.tracks[0].automation.push({
      id: "auto",
      parameter: "volume",
      points: [{ id: "last", bar: 10_100, value: 0.5 }],
    })
    expect(timelineBars(document)).toBe(10_128)
    document.tracks[0].automation = []
    expect(timelineBars(document)).toBe(10_080)
    document.transport.loop.endBar = 17
    expect(timelineBars(document)).toBe(10_016)
  })

  it("keeps a very long finite clip without imposing a song-length cap", () => {
    const document = createMockDocument()
    document.tracks.find(track => track.id === "trager")!.clips[0].lengthBars = 10_000_000
    expect(timelineBars(document)).toBe(10_000_016)
    expect(Number.isFinite(growTimelineBars(128, Number.MAX_VALUE))).toBe(true)
  })
})
