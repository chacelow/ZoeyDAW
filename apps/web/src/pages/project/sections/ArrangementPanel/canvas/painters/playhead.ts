/**
The moving playhead and stationary row-local insertion share a dedicated overlay.
*/
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"
import type { AudioRingBuffer } from "../audio/ring-buffer"
import type { ArrangementScene } from "../scene"

export interface PlayheadTokens {
  primary: string
  recording: string
}

type PlayheadContext = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "clearRect"
  | "strokeStyle"
  | "lineWidth"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "fillStyle"
  | "closePath"
  | "fill"
>

export function paintPlayhead(
  context: PlayheadContext,
  scene: ArrangementScene,
  ring: AudioRingBuffer,
  tokens: PlayheadTokens
): void {
  const { viewport } = scene
  const { width, height, pxPerBar, scrollX, dpr } = viewport
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }
  const { insertionPoint } = scene.playback
  const playing = scene.playback.playing && ring.readPlayhead().playing
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height)
  const frame = playing ? ring.readPlayhead() : null
  const bar = frame?.bar ?? insertionPoint?.bar
  if (bar === undefined) {
    return
  }
  const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
  if (x < -1 || x > width + 1) {
    return
  }
  context.strokeStyle = frame?.recording ? tokens.recording : tokens.primary
  context.lineWidth = 1
  if (playing) {
    context.beginPath()
    context.moveTo(x, top)
    context.lineTo(x, bottom)
    context.stroke()
    return
  }
  if (!insertionPoint?.trackId) {
    return
  }
  const row = layoutTrackRows(scene).find(row => row.track.id === insertionPoint.trackId)
  if (!row) {
    return
  }
  const pinnedTop = bottom - pinnedTrackHeight(scene.tracks)
  const rowTop = Math.max(isPinnedTrack(row.track) ? pinnedTop : top, row.top)
  const rowBottom = Math.min(isPinnedTrack(row.track) ? bottom : pinnedTop, row.top + row.height)
  if (rowBottom <= rowTop) {
    return
  }
  context.beginPath()
  context.moveTo(x, rowTop)
  context.lineTo(x, rowBottom)
  context.stroke()
  context.fillStyle = tokens.primary
  context.beginPath()
  context.moveTo(x - 4, top - 7)
  context.lineTo(x + 4, top - 7)
  context.lineTo(x, top - 1)
  context.closePath()
  context.fill()
}

export function paintClipAlignment(
  context: PlayheadContext,
  scene: ArrangementScene,
  color: string
): void {
  const id = scene.clipDrag ? scene.clipDrag.ids.values().next().value : scene.clipResize?.id
  if (!id) {
    return
  }
  const { width, height, pxPerBar, scrollX, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }
  for (const track of scene.tracks) {
    const clip = track.clips.find(clip => clip.id === id)
    if (!clip) {
      continue
    }
    const bar = clip.startBar + (scene.clipResize?.edge === "right" ? clip.lengthBars : 0)
    const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
    if (x < -1 || x > width + 1) {
      return
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.strokeStyle = color
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(x, arrangementBodyTop())
    context.lineTo(x, arrangementBodyBottom(height))
    context.stroke()
    return
  }
}
