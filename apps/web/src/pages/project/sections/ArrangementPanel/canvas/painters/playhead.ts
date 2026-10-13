/** The moving playhead and stationary row-local insertion share a dedicated overlay. */
import type { AudioRingBuffer } from "../audio/ring-buffer"
import type { ArrangementScene } from "../scene"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"

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
  ctx: PlayheadContext,
  scene: ArrangementScene,
  ring: AudioRingBuffer,
  tokens: PlayheadTokens
): void {
  const { viewport } = scene
  const { width, height, pxPerBar, scrollX, dpr } = viewport
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return
  const { playing, insertionPoint } = scene.playback
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height)
  const frame = playing ? ring.readPlayhead() : null
  const bar = frame?.bar ?? insertionPoint?.bar
  if (bar === undefined) return
  const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
  if (x < -1 || x > width + 1) return
  ctx.strokeStyle = frame?.recording ? tokens.recording : tokens.primary
  ctx.lineWidth = 1
  if (playing) {
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    return
  }
  if (!insertionPoint?.trackId) return
  const row = layoutTrackRows(scene).find(row => row.track.id === insertionPoint.trackId)
  if (!row) return
  const pinnedTop = bottom - pinnedTrackHeight(scene.tracks)
  const rowTop = Math.max(isPinnedTrack(row.track) ? pinnedTop : top, row.top)
  const rowBottom = Math.min(isPinnedTrack(row.track) ? bottom : pinnedTop, row.top + row.height)
  if (rowBottom <= rowTop) return
  ctx.beginPath()
  ctx.moveTo(x, rowTop)
  ctx.lineTo(x, rowBottom)
  ctx.stroke()
  ctx.fillStyle = tokens.primary
  ctx.beginPath()
  ctx.moveTo(x - 4, top - 7)
  ctx.lineTo(x + 4, top - 7)
  ctx.lineTo(x, top - 1)
  ctx.closePath()
  ctx.fill()
}

export function paintClipAlignment(
  ctx: PlayheadContext,
  scene: ArrangementScene,
  color: string
): void {
  const id = scene.clipDrag
    ? `preview-${scene.clipDrag.ids.values().next().value}`
    : scene.clipResize?.id
  if (!id) return
  const { width, height, pxPerBar, scrollX, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return
  for (const track of scene.tracks) {
    const clip = track.clips.find(clip => clip.id === id)
    if (!clip) continue
    const bar = clip.startBar + (scene.clipResize?.edge === "right" ? clip.lengthBars : 0)
    const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
    if (x < -1 || x > width + 1) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, arrangementBodyTop())
    ctx.lineTo(x, arrangementBodyBottom(height))
    ctx.stroke()
    return
  }
}
