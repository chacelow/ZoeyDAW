/**
The moving playhead and stationary row-local insertion share a dedicated overlay.
*/
import {
  LOOP_RULER_HEIGHT,
  PATTERN_RULER_HEIGHT,
  arrangementBodyBottom,
  arrangementBodyTop,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTopFor,
} from "../layout"
import type { PlayheadProjection } from "../audio/playhead-projection"
import type { ArrangementScene } from "../scene"

export interface PlayheadTokens {
  primary: string
  recording: string
  insertion?: string
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
  ring: PlayheadProjection,
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
  // The UI knows about Play before the first telemetry frame arrives. Requiring both made the
  // playhead stall on the very frame playback started.
  const sample = ring.readPlayhead()
  const playing = scene.playback.playing
  const top = arrangementBodyTop()
  const bottom = arrangementBodyBottom(height)
  // Two independent marks share this overlay: a playback line that sweeps with the transport,
  // and a stationary insertion marker where playback will start. They never replace each other.
  const drawLine = (bar: number, color: string) => {
    const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
    if (x < -1 || x > width + 1) return
    context.strokeStyle = color
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(x, top)
    context.lineTo(x, bottom)
    context.stroke()
  }
  if (playing) drawLine(sample.bar, sample.recording ? tokens.recording : tokens.primary)
  if (insertionPoint?.trackId === undefined || insertionPoint.trackId === null) {
    return
  }
  const x = Math.round((insertionPoint.bar - 1) * pxPerBar - scrollX) + 0.5
  if (x < -1 || x > width + 1) {
    return
  }
  const row = layoutTrackRows(scene).find(row => row.track.id === insertionPoint.trackId)
  if (!row) {
    return
  }
  const pinnedTop = pinnedTopFor(scene.tracks, height, {
    mode: scene.automationMode,
    lanes: scene.automationLanes,
  })
  const rowTop = Math.max(isPinnedTrack(row.track) ? pinnedTop : top, row.top)
  const rowBottom = Math.min(
    isPinnedTrack(row.track) ? bottom : pinnedTop,
    row.top + row.contentHeight
  )
  if (rowBottom > rowTop) {
    context.strokeStyle = tokens.insertion ?? tokens.primary
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(x, rowTop)
    context.lineTo(x, rowBottom)
    context.stroke()
  }
  context.fillStyle = tokens.insertion ?? tokens.primary
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

/**
Loop edges and locators draw their guide lines on the playhead overlay so clip
bodies and automation never cover them. Each line starts at the top of its own
ruler band, so it reads as one continuous stroke from the brace down through the
grid instead of starting again at the grid edge.
*/
export function paintGuides(
  context: PlayheadContext,
  scene: ArrangementScene,
  tokens: { line: string }
): void {
  const { width, height, pxPerBar, scrollX, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.strokeStyle = tokens.line
  context.lineWidth = 1
  const gridBottom = arrangementBodyBottom(height)
  for (const marker of scene.markers) {
    const x = Math.round((marker.bar - 1) * pxPerBar - scrollX) + 0.5
    if (x < -1 || x > width + 1) {
      continue
    }
    context.beginPath()
    context.moveTo(x, PATTERN_RULER_HEIGHT + LOOP_RULER_HEIGHT)
    context.lineTo(x, gridBottom)
    context.stroke()
  }
  const { loop } = scene
  // The brace frame sits 2px inside the loop band, so the guide starts on that
  // frame edge: the vertical stroke reads as the brace's own side continuing
  // down through the locator band and the grid, not as a separate line.
  const loopGuideTop = PATTERN_RULER_HEIGHT + LOOP_RULER_HEIGHT - 2
  for (const bar of [loop.startBar, loop.endBar]) {
    const x = Math.round((bar - 1) * pxPerBar - scrollX) + 0.5
    if (x < -1 || x > width + 1) {
      continue
    }
    context.beginPath()
    context.moveTo(x, loopGuideTop)
    context.lineTo(x, height)
    context.stroke()
  }
}
