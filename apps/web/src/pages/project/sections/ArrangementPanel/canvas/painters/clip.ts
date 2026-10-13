import type { Clip } from "@/pages/project/model/types"
import { clipLabel } from "@/pages/project/model/clip-label"
import type { ArrangementScene } from "../scene"
import { resolveColor, type TokenSet } from "../tokens"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  clipRect,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../layout"
import { clipVisualGeometry, type ClipVisualGeometry } from "../clip-geometry"
import { paintGroupOverview } from "./group"
import {
  paintClipLoopTicks,
  paintMidiNotes,
  paintPatternNotes,
  paintWaveform,
} from "./clip-previews"
import { paintFade } from "./clip-fades"
import { paintTimeGrid } from "./grid"

const NORMAL_PASSES = [false] as const
const DRAG_PASSES = [false, true] as const

export interface ClipPainterOptions {
  selectedClipIds: ReadonlySet<string>
  hoverClip: ArrangementScene["hoverClip"]
  automationMode: boolean
}

export function paintClips(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: TokenSet,
  options: ClipPainterOptions
): void {
  const { width, height, pxPerBar, scrollX, dpr } = scene.viewport
  if (width <= 0 || height <= 0 || pxPerBar <= 0) return
  const bodyTop = arrangementBodyTop()
  const bodyBottom = arrangementBodyBottom(height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, bodyTop, width, bodyBottom - bodyTop)
  ctx.clip()
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
  ctx.textBaseline = "middle"
  const rows = layoutTrackRows(scene)
  const pinnedTop = bodyBottom - pinnedTrackHeight(scene.tracks)
  ctx.strokeStyle = tokens["--arrangement-line"]
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const row of rows) {
    const pinned = row.track.kind === "main" || row.track.kind === "return"
    const top = Math.max(row.top, pinned ? pinnedTop : bodyTop)
    const bottom = Math.min(row.top + row.height, pinned ? bodyBottom : pinnedTop)
    if (bottom <= top) continue
    ctx.rect(0.5, Math.round(top) + 0.5, width - 1, Math.round(bottom) - Math.round(top) - 1)
  }
  ctx.stroke()
  for (const row of rows) {
    if (row.top + row.height < bodyTop || row.top > bodyBottom) continue
    ctx.save()
    ctx.beginPath()
    const pinned = row.track.kind === "return" || row.track.kind === "main"
    ctx.rect(
      0,
      pinned ? pinnedTop : bodyTop,
      width,
      Math.max(0, (pinned ? bodyBottom : pinnedTop) - (pinned ? pinnedTop : bodyTop))
    )
    ctx.clip()
    if (row.track.kind === "group") {
      paintGroupOverview(ctx, row, scene, tokens)
      ctx.restore()
      continue
    }
    const originalClips =
      scene.clipDrag?.source.find(track => track.id === row.track.id)?.clips ?? row.track.clips
    for (const ghost of scene.clipDrag ? DRAG_PASSES : NORMAL_PASSES) {
      for (const clip of ghost ? row.track.clips : originalClips) {
        if (
          ghost &&
          (!clip.id.startsWith("preview-") || !scene.clipDrag?.ids.has(clip.id.slice(8)))
        )
          continue
        const rect = clipRect(clip, row, pxPerBar, scrollX)
        if (rect.left + rect.width <= 0 || rect.left >= width) continue
        const selected =
          (!scene.clipDrag || ghost) &&
          (options.selectedClipIds.has(clip.id) ||
            (clip.id.startsWith("preview-") && options.selectedClipIds.has(clip.id.slice(8))))
        const hovered =
          !scene.clipDrag && !options.automationMode && options.hoverClip?.id === clip.id
        const visual = clipVisualGeometry(
          rect,
          clip,
          row.track,
          !ghost && hovered && options.hoverClip?.region === "body"
        )
        const color = resolveColor(clip.color ?? row.track.color, tokens, tokens["--primary"])
        ctx.save()
        ctx.beginPath()
        ctx.rect(
          Math.max(0, visual.left),
          visual.top,
          Math.max(0, Math.min(width, visual.left + visual.width) - Math.max(0, visual.left)),
          visual.height
        )
        ctx.clip()
        paintClip(
          ctx,
          clip,
          visual,
          color,
          tokens,
          {
            selected,
            hovered: hovered && !ghost,
            automationMode: options.automationMode,
            ghost,
          },
          width,
          scene
        )
        ctx.restore()
      }
    }
    ctx.restore()
  }
  const selection = scene.timeSelection
  if (selection && selection.endBar > selection.startBar) {
    const start = Math.max(0, (selection.startBar - 1) * pxPerBar - scrollX)
    const end = Math.min(width, (selection.endBar - 1) * pxPerBar - scrollX)
    if (end > start) {
      ctx.fillStyle = tokens["--primary"]
      ctx.globalAlpha = 0.2
      for (const row of rows) {
        if (!selection.trackIds.includes(row.track.id)) continue
        const pinned = row.track.kind === "return" || row.track.kind === "main"
        const top = Math.max(bodyTop, row.top, pinned ? pinnedTop : bodyTop)
        const bottom = Math.min(bodyBottom, row.top + row.height, pinned ? bodyBottom : pinnedTop)
        if (bottom > top) ctx.fillRect(start, top, end - start, bottom - top)
      }
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()
}

function paintClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  g: ClipVisualGeometry,
  color: string,
  tokens: TokenSet,
  state: { selected: boolean; hovered: boolean; automationMode: boolean; ghost: boolean },
  viewportWidth: number,
  scene: ArrangementScene
): void {
  const { left, top, width, height, bodyTop, bodyHeight, titleHeight } = g
  const numerator = scene.transport.numerator
  const opacity = state.ghost ? 0.5 : 1
  ctx.globalAlpha = opacity
  ctx.fillStyle = state.selected && bodyHeight === 0 ? tokens["--arrangement-clip-selected"] : color
  ctx.fillRect(left, top, width, titleHeight)
  if (bodyHeight > 0) {
    ctx.fillStyle = state.selected ? tokens["--arrangement-clip-selected"] : color
    ctx.globalAlpha = (state.selected ? 0.9 : state.automationMode ? 0.25 : 0.55) * opacity
    ctx.fillRect(left, bodyTop, width, bodyHeight)
    paintTimeGrid(
      ctx,
      scene,
      tokens["--arrangement-grid-minor"],
      tokens["--arrangement-grid-major"],
      bodyTop,
      bodyTop + bodyHeight,
      Math.max(0, left),
      Math.min(viewportWidth, left + width),
      0.4 * opacity
    )
    ctx.fillStyle = tokens["--arrangement-line"]
    ctx.globalAlpha = (state.automationMode ? 0.14 : 0.3) * opacity
    ctx.fillRect(left, bodyTop, width, 1)
    ctx.globalAlpha = (state.automationMode ? 0.4 : 1) * opacity
    const ink = tokens["--arrangement-clip-ink"]
    if (clip.kind === "audio")
      paintWaveform(ctx, clip, left, bodyTop, width, bodyHeight, ink, viewportWidth)
    else if (clip.kind === "midi")
      paintMidiNotes(ctx, clip, left, bodyTop, width, bodyHeight, ink, numerator, viewportWidth)
    else paintPatternNotes(ctx, clip, left, bodyTop, width, bodyHeight, ink, viewportWidth)
    ctx.globalAlpha = (state.automationMode ? 0.4 : 1) * opacity
  }
  if (clip.kind === "audio" && !state.automationMode && !state.ghost)
    for (const fade of g.fades) paintFade(ctx, fade, g, tokens)
  ctx.globalAlpha = opacity
  paintClipLoopTicks(ctx, clip, left, top, width, viewportWidth, tokens["--arrangement-clip-ink"])
  ctx.fillStyle = tokens["--arrangement-clip-ink"]
  ctx.save()
  ctx.beginPath()
  ctx.rect(left + 2, top, Math.max(0, width - 4), titleHeight)
  ctx.clip()
  ctx.fillText(clipLabel(clip), left + 4, top + titleHeight / 2)
  ctx.restore()
  if (state.hovered && !state.selected) {
    ctx.strokeStyle = tokens["--foreground"]
    ctx.globalAlpha = 0.45
    ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)
    ctx.globalAlpha = 1
  }
  ctx.globalAlpha = 1
}
