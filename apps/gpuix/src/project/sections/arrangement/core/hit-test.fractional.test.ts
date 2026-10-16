import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { describe, expect, it } from "bun:test"
import { createMockDocument } from "../../../adapters/fixtures"
import { createSceneStore } from "./scene"
import { clipRect, layoutTrackRows } from "./layout"
import { hitTest } from "./hit-test"

describe("clip hit geometry at fractional zoom", () => {
  it("respects painted rounded bounds and aligned fade handle", () => {
    const score = createMockDocument()
    const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    scene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 0.25 },
      transport: score.transport,
      tracks: score.tracks,
      markers: score.markers,
      loop: score.transport.loop,
    })
    scene.setViewport({ pxPerBar: 11.3, scrollX: 3.7, scrollY: 0, width: 600, height: 600, dpr: 2 })
    const snapshot = scene.get()
    const row = layoutTrackRows(snapshot).find(item => item.track.id === "3-audio")
    const audio = row?.track.clips.find(clip => clip.id === "audio-1")
    if (!row || !audio) {
      throw new Error("Missing audio fixture")
    }
    const rect = clipRect(audio, row, snapshot.viewport.pxPerBar, snapshot.viewport.scrollX)
    const left = Math.round(rect.left)
    const top = Math.round(rect.top + 1)
    expect(hitTest(snapshot, left + 1, top + 3)?.kind).toBe("clip-resize")
    expect(hitTest(snapshot, left + 10, top + 3)?.kind).toBe("clip-title")
    expect(hitTest(snapshot, left + 10, top + 24)?.kind).toBe("clip-body")
    expect(hitTest(snapshot, left + 10, top - 0.1)?.kind).toBe("track-lane")
  })
})
