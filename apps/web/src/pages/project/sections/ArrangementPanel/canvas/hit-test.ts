import {
  arrangementBodyBottom,
  arrangementBodyTop,
  clipRect,
  layoutTrackRows,
  pinnedTrackHeight,
} from "./layout"
import { clipVisualGeometry, fadeHandleX, FADE_HANDLE_PX, RESIZE_EDGE_PX } from "./clip-geometry"
import type { Clip, Track } from "@zoeydaw/project-core/types"
import type { ArrangementScene } from "./scene"

export type HitTarget =
  | { kind: "clip-title" | "clip-body"; clip: Clip; track: Track }
  | {
      kind: "clip-resize"
      clip: Clip
      track: Track
      edge: "left" | "right"
      region: "title"
    }
  | {
      kind: "clip-fade"
      clip: Clip
      track: Track
      edge: "in" | "out"
      handle: "length" | "curve"
    }
  | { kind: "track-lane"; track: Track; bar: number }
  | null

export function hitTest(
  scene: ArrangementScene,
  pointX: number,
  pointY: number,
  automationMode = false
): HitTarget {
  const { viewport, bars } = scene
  const { height, pxPerBar, scrollX } = viewport
  const bodyTop = arrangementBodyTop()
  const bodyBottom = arrangementBodyBottom(height)
  if (pointY < bodyTop || pointY > bodyBottom || pxPerBar <= 0) {
    return null
  }

  const rows = layoutTrackRows(scene)
  const pinnedTop =
    bodyBottom -
    pinnedTrackHeight(scene.tracks, { mode: scene.automationMode, lanes: scene.automationLanes })
  const row = rows.find(
    r =>
      pointY >= Math.max(bodyTop, r.top) &&
      pointY < Math.min(bodyBottom, r.top + r.height) &&
      (r.track.kind === "return" || r.track.kind === "main"
        ? pointY >= pinnedTop
        : pointY < pinnedTop)
  )
  if (!row || row.track.kind === "group") {
    return row
      ? { kind: "track-lane", track: row.track, bar: barAt(pointX, pxPerBar, scrollX, bars) }
      : null
  }
  if (pointY >= row.top + row.contentHeight)
    return { kind: "track-lane", track: row.track, bar: barAt(pointX, pxPerBar, scrollX, bars) }

  for (let index = row.track.clips.length - 1; index >= 0; index--) {
    const clip = row.track.clips[index]
    const rect = clipRect(clip, row, pxPerBar, scrollX)
    const isVisibleFades =
      !automationMode && scene.hoverClip?.id === clip.id && scene.hoverClip.region === "body"
    const visual = clipVisualGeometry(rect, clip, row.track, isVisibleFades)
    const { left, top, width, height, bodyTop: bodyTopY, bodyHeight } = visual
    if (pointY < top || pointY >= top + height || pointX < left || pointX > left + width) {
      continue
    }
    const fromLeft = pointX - left
    const fromRight = left + width - pointX
    for (const fade of visual.fades) {
      if (!fade.handlesVisible || pointY < bodyTopY) {
        continue
      }
      const peak = fade.edge === "in" ? fade.end : fade.start
      if (
        Math.abs(pointX - fadeHandleX(visual, peak.x)) <= FADE_HANDLE_PX &&
        Math.abs(pointY - peak.y) <= FADE_HANDLE_PX
      ) {
        return {
          kind: "clip-fade",
          clip,
          track: row.track,
          edge: fade.edge,
          handle: "length",
        }
      }
      if (
        fade.end.x - fade.start.x >= FADE_HANDLE_PX * 2 &&
        Math.abs(pointX - fade.curve.x) <= FADE_HANDLE_PX &&
        Math.abs(pointY - fade.curve.y) <= FADE_HANDLE_PX
      ) {
        return { kind: "clip-fade", clip, track: row.track, edge: fade.edge, handle: "curve" }
      }
    }
    const region = pointY < bodyTopY || bodyHeight === 0 ? "title" : "body"
    if (region === "title" && fromLeft <= RESIZE_EDGE_PX) {
      return { kind: "clip-resize", clip, track: row.track, edge: "left", region }
    }
    if (region === "title" && fromRight <= RESIZE_EDGE_PX) {
      return { kind: "clip-resize", clip, track: row.track, edge: "right", region }
    }
    return {
      kind: pointY < bodyTopY || bodyHeight === 0 ? "clip-title" : "clip-body",
      clip,
      track: row.track,
    }
  }

  return { kind: "track-lane", track: row.track, bar: barAt(pointX, pxPerBar, scrollX, bars) }
}

function barAt(pointX: number, pxPerBar: number, scrollX: number, bars: number): number {
  const bar = 1 + (pointX + scrollX) / pxPerBar
  return Math.max(1, Math.min(bars + 1, bar))
}
