import { describe, expect, it } from "vitest"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { positionToBar } from "@/pages/project/model/types"
import { deriveGridPlan } from "@/pages/project/model/grid"
import { timelineBars } from "@/pages/project/model/selectors"
import { hitTest } from "./hit-test"
import { arrangementBodyTop, clipRect, layoutTrackRows } from "./layout"
import { clipVisualGeometry } from "./clip-geometry"
import type { ArrangementScene, ArrangementViewport } from "./scene"

function fixtureScene(partial?: Partial<ArrangementScene>): ArrangementScene {
  const document_ = createMockDocument()
  const workspace = createMockWorkspace()
  const bars = timelineBars(document_)
  const viewport: ArrangementViewport = {
    pxPerBar: workspace.pxPerBar,
    scrollX: 0,
    scrollY: 0,
    width: 1600,
    height: 500,
    dpr: 1,
  }
  return {
    revision: 0,
    viewport,
    bars,
    grid: workspace.grid,
    gridPlan: deriveGridPlan(
      workspace.grid,
      viewport.pxPerBar,
      document_.transport.numerator,
      document_.transport.denominator
    ),
    playback: { playing: false, insertionPoint: null },
    transport: {
      bpm: document_.transport.bpm,
      numerator: document_.transport.numerator,
      denominator: document_.transport.denominator,
    },
    markers: document_.markers,
    loop: document_.transport.loop,
    tracks: document_.tracks,
    previewTracks: null,
    clipDrag: null,
    clipResize: null,
    previewMarkers: null,
    previewLoop: null,
    targetSelection: { kind: "none" },
    automationParameters: {},
    selectedClipIds: new Set(),
    selectedTrackIds: new Set(),
    hoverClip: null,
    timeSelection: null,
    ...partial,
    ...(partial?.viewport && { viewport: { ...viewport, ...partial.viewport } }),
  }
}

describe("arrangement hit-test", () => {
  it("returns null above the body ruler band", () => {
    const scene = fixtureScene()
    expect(hitTest(scene, 100, arrangementBodyTop() - 1)).toBeNull()
  })

  it("returns a clip body for a point inside a clip rectangle", () => {
    const scene = fixtureScene()
    const audioTrack = scene.tracks.find(t => t.kind === "audio" && t.clips.length > 0)
    if (!audioTrack) {
      throw new Error("Missing audio track fixture")
    }
    const clip = audioTrack.clips[0]
    const centerBar = clip.startBar + clip.lengthBars / 2
    const x = (centerBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX
    const row = layoutTrackRows(scene).find(row => row.track.id === audioTrack.id)
    if (!row) {
      throw new Error("Missing audio row")
    }
    const y = row.top + 28
    const result = hitTest(scene, x, y)
    expect(result).not.toBeNull()
    if (!result) {
      return
    }
    expect(result.kind).toBe("clip-body")
    if (result.kind === "clip-body") {
      expect(result.clip.id).toBe(clip.id)
    }
  })

  it("prefers the resize edge over the body within six pixels of a clip side", () => {
    const scene = fixtureScene()
    const audioTrack = scene.tracks.find(t => t.kind === "audio" && t.clips.length > 0)
    if (!audioTrack) {
      throw new Error("Missing audio track fixture")
    }
    const clip = audioTrack.clips[0]
    const leftEdgeX = (clip.startBar - 1) * scene.viewport.pxPerBar - scene.viewport.scrollX + 2
    const row = layoutTrackRows(scene).find(row => row.track.id === audioTrack.id)
    if (!row) {
      throw new Error("Missing audio row")
    }
    const y = row.top + 28
    const result = hitTest(scene, leftEdgeX, y)
    expect(result?.kind).toBe("clip-resize")
    if (result?.kind === "clip-resize") {
      expect(result.edge).toBe("left")
    }
  })

  it("returns the track lane with a snap bar when the pointer misses every clip", () => {
    const scene = fixtureScene()
    const audio = scene.tracks.find(t => t.kind === "audio")
    if (!audio) {
      throw new Error("Missing audio track fixture")
    }
    const row = layoutTrackRows(scene).find(row => row.track.id === audio.id)
    if (!row) {
      throw new Error("Missing audio row")
    }
    const y = row.top + 28
    const farRight = (scene.bars - 5) * scene.viewport.pxPerBar
    const result = hitTest(scene, farRight, y)
    expect(result?.kind).toBe("track-lane")
    if (result?.kind === "track-lane") {
      expect(result.track.id).toBe(audio.id)
    }
  })

  it("ignores stale cursor references by returning null above the body", () => {
    const scene = fixtureScene()
    expect(hitTest(scene, 100, 2)).toBeNull()
    expect(positionToBar({ bar: 1, beat: 1, sixteenth: 1 }, 4)).toBe(1)
  })
  it("separates title, body, draggable peaks and curves from fixed quiet anchors", () => {
    const base = fixtureScene({ viewport: { ...fixtureScene().viewport, pxPerBar: 32 } })
    const track = base.tracks.find(item => item.id === "3-audio")
    if (!track) {
      throw new Error("Missing audio fixture track")
    }
    const tracks = base.tracks.map(item =>
      item.id === track.id
        ? {
            ...item,
            heightPx: 96,
            clips: item.clips.map(clip =>
              clip.kind === "audio"
                ? {
                    ...clip,
                    fadeInOffsetBars: 1,
                    fadeInBars: 2,
                    fadeOutOffsetBars: 1,
                    fadeOutBars: 2,
                  }
                : clip
            ),
          }
        : item
    )
    const scene: ArrangementScene = {
      ...base,
      tracks,
      hoverClip: { id: "audio-1", region: "body" },
    }
    const row = layoutTrackRows(scene).find(item => item.track.id === "3-audio")
    if (!row) {
      throw new Error("Missing audio fixture row")
    }
    const audio = row.track.clips.find(clip => clip.id === "audio-1")
    if (!audio || audio.kind !== "audio") {
      throw new Error("Missing audio fixture")
    }
    const rect = clipRect(audio, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
    const geometry = clipVisualGeometry(rect, audio, row.track, true)
    expect(hitTest(scene, rect.left + 150, rect.top + 6)?.kind).toBe("clip-title")
    expect(hitTest(scene, rect.left + 150, rect.top + 29)?.kind).toBe("clip-body")
    const titleHover: ArrangementScene = { ...scene, hoverClip: { id: audio.id, region: "title" } }
    expect(hitTest(titleHover, geometry.fades[0].curve.x, geometry.fades[0].curve.y)?.kind).toBe(
      "clip-body"
    )
    expect(hitTest(scene, geometry.fades[0].end.x, geometry.bodyTop - 1)?.kind).toBe("clip-title")
    for (const fade of geometry.fades) {
      const length = fade.edge === "in" ? fade.end : fade.start
      const boundary = fade.edge === "in" ? fade.start : fade.end
      expect(hitTest(scene, length.x, length.y)).toMatchObject({
        kind: "clip-fade",
        edge: fade.edge,
        handle: "length",
      })
      expect(hitTest(scene, boundary.x, boundary.y)?.kind).not.toBe("clip-fade")
      expect(hitTest(scene, fade.curve.x, fade.curve.y)).toMatchObject({
        kind: "clip-fade",
        edge: fade.edge,
        handle: "curve",
      })
    }
    expect(
      hitTest(scene, geometry.fades[0].curve.x, geometry.fades[0].curve.y, true)?.kind
    ).not.toBe("clip-fade")
    expect(
      hitTest(
        { ...scene, hoverClip: null, selectedClipIds: new Set([audio.id]) },
        geometry.fades[0].curve.x,
        geometry.fades[0].curve.y
      )?.kind
    ).not.toBe("clip-fade")
  })

  it("removes body and hidden fade targets on an ordinary folded lane", () => {
    const scene = fixtureScene({ viewport: { ...fixtureScene().viewport, pxPerBar: 32 } })
    const tracks = scene.tracks.map(track =>
      track.id === "3-audio" ? { ...track, collapsed: true } : track
    )
    const folded = { ...scene, tracks, hoverClipId: "audio-1" }
    const row = layoutTrackRows(folded).find(row => row.track.id === "3-audio")
    if (!row) {
      throw new Error("Missing audio fixture row")
    }
    const audio = row.track.clips.find(clip => clip.id === "audio-1")
    if (!audio) {
      throw new Error("Missing audio fixture")
    }
    const rect = clipRect(audio, row, folded.viewport.pxPerBar, folded.viewport.scrollX)
    const geometry = clipVisualGeometry(rect, audio, row.track, true)
    expect(geometry.bodyHeight).toBe(0)
    expect(geometry.top).toBe(row.top + 1)
    expect(geometry.top + geometry.height).toBe(row.top + row.height - 1)
    expect(hitTest(folded, rect.left + 30, row.top + row.height - 1.5)?.kind).toBe("clip-title")
    expect(geometry.fades.find(fade => fade.edge === "in")).toMatchObject({
      handlesVisible: false,
      start: { y: geometry.top + geometry.height },
      end: { y: geometry.top },
    })
    expect(geometry.fades.find(fade => fade.edge === "out")).toMatchObject({
      handlesVisible: false,
      start: { y: geometry.top },
      end: { y: geometry.top + geometry.height },
    })
    expect(hitTest(folded, rect.left + 30, geometry.top + 5)?.kind).toBe("clip-title")
  })

  it("allows zero-length fades to start from their visible upper length handles", () => {
    const scene = fixtureScene({ hoverClip: { id: "audio-1", region: "body" } })
    const row = layoutTrackRows(scene).find(item => item.track.id === "3-audio")
    const audio = row?.track.clips.find(clip => clip.id === "audio-1")
    if (!row || audio?.kind !== "audio") {
      throw new Error("Missing audio fixture")
    }
    audio.fadeInBars = 0
    audio.fadeOutBars = 0
    const geometry = clipVisualGeometry(
      clipRect(audio, row, scene.viewport.pxPerBar, scene.viewport.scrollX),
      audio,
      row.track,
      true
    )
    for (const fade of geometry.fades) {
      const length = fade.edge === "in" ? fade.end : fade.start
      expect(hitTest(scene, length.x, length.y)).toMatchObject({
        kind: "clip-fade",
        edge: fade.edge,
        handle: "length",
      })
    }
  })
})
