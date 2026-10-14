import { clipLabel } from "@/pages/project/model/clip-label"
import { resolveColor } from "../tokens"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  clipRect,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"
import { clipVisualGeometry } from "../clip-geometry"
import { paintGroupOverview } from "./group"
import {
  paintClipLoopTicks,
  paintMidiNotes,
  paintPatternNotes,
  paintWaveform,
} from "./clip-previews"
import { paintFade } from "./clip-fades"
import { paintTimeGrid } from "./grid"
import type { ClipVisualGeometry } from "../clip-geometry"
import type { TokenSet } from "../tokens"
import type { ArrangementScene } from "../scene"
import type { Clip } from "@/pages/project/model/types"

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
  const pinnedTop = bodyBottom - pinnedTrackHeight(scene.tracks)
  context.strokeStyle = tokens["--arrangement-line"]
  context.lineWidth = 1
  context.beginPath()
  for (const row of rows) {
    const isPinned = row.track.kind === "main" || row.track.kind === "return"
    const top = Math.max(row.top, isPinned ? pinnedTop : bodyTop)
    const bottom = Math.min(row.top + row.height, isPinned ? bodyBottom : pinnedTop)
    if (bottom <= top) {
      continue
    }
    context.rect(0.5, Math.round(top) + 0.5, width - 1, Math.round(bottom) - Math.round(top) - 1)
  }
  context.stroke()
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
      paintGroupOverview(context, row, scene, tokens)
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
        const color = resolveColor(clip.color ?? row.track.color, tokens, tokens["--primary"])
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
      for (const row of rows) {
        if (!selection.trackIds.includes(row.track.id)) {
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
  context.globalAlpha = opacity
  context.fillStyle =
    state.selected && bodyHeight === 0 ? tokens["--arrangement-clip-selected"] : color
  context.fillRect(left, top, width, titleHeight)
  if (bodyHeight > 0) {
    context.fillStyle = state.selected ? tokens["--arrangement-clip-selected"] : color
    context.globalAlpha = (state.selected ? 0.9 : state.automationMode ? 0.25 : 0.55) * opacity
    context.fillRect(left, bodyTop, width, bodyHeight)
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
    context.globalAlpha = (state.automationMode ? 0.4 : 1) * opacity
    const ink = tokens["--arrangement-clip-ink"]
    if (clip.kind === "audio") {
      paintWaveform(context, clip, left, bodyTop, width, bodyHeight, ink, viewportWidth)
    } else if (clip.kind === "midi") {
      paintMidiNotes(context, clip, left, bodyTop, width, bodyHeight, ink, numerator, viewportWidth)
    } else {
      paintPatternNotes(context, clip, left, bodyTop, width, bodyHeight, ink, viewportWidth)
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
    tokens["--arrangement-clip-ink"]
  )
  context.fillStyle = tokens["--arrangement-clip-ink"]
  context.save()
  context.beginPath()
  context.rect(left + 2, top, Math.max(0, width - 4), titleHeight)
  context.clip()
  context.fillText(clipLabel(clip), left + 4, top + titleHeight / 2)
  context.restore()
  if (state.hovered && !state.selected) {
    context.strokeStyle = tokens["--foreground"]
    context.globalAlpha = 0.45
    context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)
    context.globalAlpha = 1
  }
  context.globalAlpha = 1
}
