import { clipLabel } from "@zoeydaw/project-core/clip-label"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { resolveColor } from "../tokens"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  clipRect,
  layoutTrackRows,
  pinnedTopFor,
} from "../layout"
import { clipVisualGeometry } from "../clip-geometry"
import { paintGroupOverview } from "./group"
import { paintClipLoopTicks, paintMidiNotes, paintWaveform } from "./clip-previews"
import { paintFade } from "./clip-fades"
import { paintTimeGrid } from "./grid"
import type { ClipVisualGeometry } from "../clip-geometry"
import type { TokenSet } from "../tokens"
import type { ArrangementScene } from "../scene"
import type { Clip } from "@zoeydaw/project-core/types"

const NORMAL_PASSES = [false] as const
const DRAG_PASSES = [false, true] as const

export interface ClipPainterOptions {
  selectedClipIds: ReadonlySet<string>
  hoverClip: ArrangementScene["hoverClip"]
  automationMode: boolean
}

export function paintClips(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: TokenSet,
  options: ClipPainterOptions
): void {
  const { width, height, pxPerBar, scrollX, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) {
    return
  }
  const bodyTop = arrangementBodyTop()
  const bodyBottom = arrangementBodyBottom(height)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.save()
  context.beginPath()
  context.rect(0, bodyTop, width, bodyBottom - bodyTop)
  context.clip()
  context.font = "10px ui-sans-serif, system-ui, sans-serif"
  context.textBaseline = "middle"
  const rows = layoutTrackRows(scene)
  const pinnedTop = pinnedTopFor(scene.tracks, height, {
    mode: scene.automationMode,
    lanes: scene.automationLanes,
  })
  context.strokeStyle = tokens["--arrangement-line"]
  context.lineWidth = 2
  context.beginPath()
  // The locator band already draws the stack's top border, so this pass only
  // adds one divider at each row join; drawing a second top line doubled it.
  for (const row of rows) {
    const isPinned = row.track.kind === "main" || row.track.kind === "return"
    const top = Math.max(row.top, isPinned ? pinnedTop : bodyTop)
    const bottom = Math.min(row.top + row.height, isPinned ? bodyBottom : pinnedTop)
    if (bottom <= top || bottom >= bodyBottom || (!isPinned && bottom >= pinnedTop)) {
      continue
    }
    const y = Math.round(bottom) - 1
    context.moveTo(0, y)
    context.lineTo(width, y)
  }
  if (pinnedTop > bodyTop && pinnedTop < bodyBottom) {
    const y = Math.round(pinnedTop) - 1
    context.moveTo(0, y)
    context.lineTo(width, y)
  }
  context.stroke()
  context.lineWidth = 1
  for (const row of rows) {
    if (row.top + row.height < bodyTop || row.top > bodyBottom) {
      continue
    }
    context.save()
    context.beginPath()
    const isPinned = row.track.kind === "return" || row.track.kind === "main"
    context.rect(
      0,
      isPinned ? pinnedTop : bodyTop,
      width,
      Math.max(0, (isPinned ? bodyBottom : pinnedTop) - (isPinned ? pinnedTop : bodyTop))
    )
    context.clip()
    if (row.track.kind === "group") {
      paintGroupOverview(context, { ...row, height: row.contentHeight }, scene, tokens)
      context.restore()
      continue
    }
    const originalClips =
      scene.clipDrag?.source.find(track => track.id === row.track.id)?.clips ?? row.track.clips
    for (const ghost of scene.clipDrag ? DRAG_PASSES : NORMAL_PASSES) {
      for (const clip of ghost ? row.track.clips : originalClips) {
        if (ghost && !scene.clipDrag?.ids.has(clip.id)) {
          continue
        }
        const rect = clipRect(clip, row, pxPerBar, scrollX)
        if (rect.left + rect.width <= 0 || rect.left >= width) {
          continue
        }
        const selected = ghost
          ? !!scene.clipDrag?.ids.has(clip.id)
          : !scene.clipDrag && options.selectedClipIds.has(clip.id)
        const isHovered =
          !scene.clipDrag && !options.automationMode && options.hoverClip?.id === clip.id
        const visual = clipVisualGeometry(
          rect,
          clip,
          row.track,
          !ghost && isHovered && options.hoverClip?.region === "body"
        )
        const color = clip.mute
          ? tokens["--muted-foreground"]
          : resolveColor(clip.color ?? row.track.color, tokens, tokens["--primary"])
        context.save()
        context.beginPath()
        context.rect(
          Math.max(0, visual.left),
          visual.top,
          Math.max(0, Math.min(width, visual.left + visual.width) - Math.max(0, visual.left)),
          visual.height
        )
        context.clip()
        paintClip(
          context,
          clip,
          visual,
          color,
          tokens,
          {
            selected,
            hovered: isHovered && !ghost,
            automationMode: options.automationMode,
            ghost,
          },
          width,
          scene
        )
        context.restore()
      }
    }
    context.restore()
  }
  const selection = scene.timeSelection
  if (selection && selection.endBar > selection.startBar) {
    const start = Math.max(0, (selection.startBar - 1) * pxPerBar - scrollX)
    const end = Math.min(width, (selection.endBar - 1) * pxPerBar - scrollX)
    if (end > start) {
      context.fillStyle = tokens["--primary"]
      context.globalAlpha = 0.2
      // One Set per frame: this runs for every visible row on every paint.
      const selectedTracks = new Set(selection.trackIds)
      for (const row of rows) {
        if (!selectedTracks.has(row.track.id)) {
          continue
        }
        const isPinned = row.track.kind === "return" || row.track.kind === "main"
        const top = Math.max(bodyTop, row.top, isPinned ? pinnedTop : bodyTop)
        const bottom = Math.min(bodyBottom, row.top + row.height, isPinned ? bodyBottom : pinnedTop)
        if (bottom > top) {
          context.fillRect(start, top, end - start, bottom - top)
        }
      }
      context.globalAlpha = 1
    }
  }
  context.restore()
}

function paintClip(
  context: CanvasRenderingContext2D,
  clip: Clip,
  g: ClipVisualGeometry,
  color: string,
  tokens: TokenSet,
  state: { selected: boolean; hovered: boolean; automationMode: boolean; ghost: boolean },
  viewportWidth: number,
  scene: ArrangementScene
): void {
  const { left, top, width, height, bodyTop, bodyHeight, titleHeight } = g
  const { numerator } = scene.transport
  const opacity = state.ghost ? 0.5 : 1
  const muted = clip.mute === true
  const bodyColor = state.selected ? tokens["--arrangement-clip-selected"] : color
  const titleColor = muted
    ? tokens["--arrangement-muted-clip-title"]
    : state.selected && bodyHeight === 0
      ? tokens["--arrangement-clip-selected"]
      : color
  context.globalAlpha = opacity
  context.fillStyle = titleColor
  context.fillRect(left, top, width, titleHeight)
  if (bodyHeight > 0) {
    if (!muted) {
      context.fillStyle = bodyColor
      context.globalAlpha = (state.selected ? 0.9 : state.automationMode ? 0.25 : 0.55) * opacity
      context.fillRect(left, bodyTop, width, bodyHeight)
    }
    paintTimeGrid(
      context,
      scene,
      tokens["--arrangement-grid-minor"],
      tokens["--arrangement-grid-major"],
      bodyTop,
      bodyTop + bodyHeight,
      Math.max(0, left),
      Math.min(viewportWidth, left + width),
      0.4 * opacity
    )
    context.fillStyle = tokens["--arrangement-line"]
    context.globalAlpha = (state.automationMode ? 0.14 : 0.3) * opacity
    context.fillRect(left, bodyTop, width, 1)
    context.globalAlpha = (muted ? 0.25 : state.automationMode ? 0.4 : 1) * opacity
    const ink = muted ? tokens["--muted-foreground"] : tokens["--arrangement-clip-ink"]
    if (clip.kind === "audio") {
      paintWaveform(
        context,
        clip,
        left,
        bodyTop,
        width,
        bodyHeight,
        ink,
        viewportWidth,
        scene.media,
        scene.transport
      )
    } else {
      paintMidiNotes(
        context,
        resolveMidiClip(clip, scene.patterns),
        left,
        bodyTop,
        width,
        bodyHeight,
        ink,
        numerator,
        viewportWidth
      )
    }
    context.globalAlpha = (state.automationMode ? 0.4 : 1) * opacity
  }
  if (clip.kind === "audio" && !state.automationMode && !state.ghost) {
    for (const fade of g.fades) {
      paintFade(context, fade, g, tokens)
    }
  }
  context.globalAlpha = opacity
  paintClipLoopTicks(
    context,
    clip,
    left,
    top,
    width,
    viewportWidth,
    muted ? tokens["--arrangement-muted-clip"] : tokens["--arrangement-clip-ink"],
    scene.media,
    scene.patterns
  )
  context.fillStyle = tokens["--arrangement-clip-ink"]
  context.globalAlpha = (muted ? 0.65 : 1) * opacity
  context.save()
  context.beginPath()
  context.rect(left + 2, top, Math.max(0, width - 4), titleHeight)
  context.clip()
  context.fillText(clipLabel(clip, scene.media), left + 4, top + titleHeight / 2)
  context.restore()
  if (state.hovered && !state.selected) {
    context.strokeStyle = tokens["--foreground"]
    context.globalAlpha = 0.45
    context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)
    context.globalAlpha = 1
  }
  context.globalAlpha = 1
}
