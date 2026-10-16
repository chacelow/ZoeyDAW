import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { describe, expect, it } from "bun:test"
import { createMockDocument } from "../../../adapters/fixtures"
import { alignmentBar } from "./clip-alignment"
import { createSceneStore } from "./scene"
import type { PatternClip } from "../../../model/types"

function patternScene() {
  const score = createMockDocument()
  const track = score.tracks.find(track => track.id === "trager")
  if (!track) {
    throw new Error("Missing MIDI fixture track")
  }
  const pattern: PatternClip = {
    id: "pattern-ghost",
    kind: "pattern",
    patternId: "beat",
    startBar: 3,
    lengthBars: 4,
    steps: [true, false, false, false],
  }
  track.clips = [pattern]
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  store.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: score.transport,
    tracks: score.tracks,
    markers: score.markers,
    loop: score.transport.loop,
  })
  return { store, source: score.tracks, pattern, trackId: track.id }
}

describe("clip alignment bar", () => {
  it("has no alignment outside a clip gesture", () => {
    const { store } = patternScene()
    expect(alignmentBar(store.get())).toBeNull()
  })

  it("aligns a Pattern drag ghost to its preview start rather than the source start", () => {
    const { store, source, pattern, trackId } = patternScene()
    store.setClipDrag({ source, ids: new Set([pattern.id]) })
    store.setProjectPreview({
      kind: "tracks",
      token: { sessionId: "arrangement", id: "pattern-move" },
      tracks: source.map(track =>
        track.id === trackId ? { ...track, clips: [{ ...pattern, startBar: 9.25 }] } : track
      ),
    })
    expect(alignmentBar(store.get())).toBe(9.25)
    expect(pattern.startBar).toBe(3)
  })

  it.each(["left", "right"] as const)(
    "aligns a Pattern %s resize to its left start, never its end",
    edge => {
      const { store, source, pattern, trackId } = patternScene()
      store.setClipResize({ id: pattern.id, edge })
      store.setProjectPreview({
        kind: "tracks",
        token: { sessionId: "arrangement", id: "pattern-resize" },
        tracks: source.map(track =>
          track.id === trackId
            ? { ...track, clips: [{ ...pattern, startBar: 2.5, lengthBars: 7 }] }
            : track
        ),
      })
      expect(alignmentBar(store.get())).toBe(2.5)
    }
  )

  it("uses the first dragged clip ID, not track order or the leftmost clip", () => {
    const { store, source, pattern, trackId } = patternScene()
    store.setClipDrag({ source, ids: new Set(["second-pattern", pattern.id]) })
    store.setProjectPreview({
      kind: "tracks",
      token: { sessionId: "arrangement", id: "multi-move" },
      tracks: source.map(track =>
        track.id === trackId
          ? {
              ...track,
              clips: [pattern, { ...pattern, id: "second-pattern", startBar: 17.75 }],
            }
          : track
      ),
    })
    expect(alignmentBar(store.get())).toBe(17.75)
  })

  it("does not gate bar geometry on viewport size or zoom", () => {
    const { store, pattern } = patternScene()
    store.setClipResize({ id: pattern.id, edge: "right" })
    store.setViewport({ pxPerBar: 0, scrollX: 900, scrollY: 0, width: 0, height: 0, dpr: 1 })
    expect(alignmentBar(store.get())).toBe(3)
  })

  it("returns null for a missing clip instead of using a source clip", () => {
    const { store, source } = patternScene()
    store.setClipDrag({ source, ids: new Set(["missing"]) })
    expect(alignmentBar(store.get())).toBeNull()
    store.setClipDrag(null)
    store.setClipResize({ id: "missing", edge: "right" })
    expect(alignmentBar(store.get())).toBeNull()
  })

  it("does not fall back to resize alignment during an empty drag", () => {
    const { store, source, pattern } = patternScene()
    store.setClipResize({ id: pattern.id, edge: "left" })
    store.setClipDrag({ source, ids: new Set() })
    expect(alignmentBar(store.get())).toBeNull()
  })
})
