import type { Theme } from "@/shared/theme/ThemeProvider"
import { patternHasActivity, patternWindow } from "@/project/model/pattern-window"
import { PATTERN_STEPS_PER_BAR } from "@/project/model/types"
import type { Clip, MidiClip, PatternClip } from "@/project/model/types"
import { clipVisualGeometry } from "../core/clip-geometry"
import type { ClipVisualGeometry } from "../core/clip-geometry"
import {
  arrangementBodyBottom,
  arrangementBodyTop,
  clipRect,
  isPinnedTrack,
  layoutTrackRows,
  pinnedTrackHeight,
} from "../core/layout"
import type { ClipRect, TrackRow } from "../core/layout"
import type { ArrangementScene } from "../core/scene"

export interface VisibleRow extends TrackRow {
  clipTop: number
  clipBottom: number
}

export interface ClipCard {
  clip: Clip
  fadeGeometry: ClipVisualGeometry | null
  geometry: ClipVisualGeometry
  ghost: boolean
  selected: boolean
  hovered: boolean
}

export type ClipCardProjector<T extends ClipCard> = (
  rect: ClipRect,
  ghost: boolean,
  selected: boolean,
  hovered: boolean,
  fadesVisible: boolean
) => T

export function projectLocalFadeGeometry(
  rect: ClipRect,
  ghost: boolean,
  fadesVisible: boolean
): ClipVisualGeometry | null {
  if (rect.clip.kind !== "audio" || ghost) return null
  return clipVisualGeometry({ ...rect, left: 0 }, rect.clip, rect.track, fadesVisible)
}

const freshCard: ClipCardProjector<ClipCard> = (rect, ghost, selected, hovered, fadesVisible) => ({
  clip: rect.clip,
  fadeGeometry: projectLocalFadeGeometry(rect, ghost, fadesVisible),
  geometry: clipVisualGeometry(rect, rect.clip, rect.track, fadesVisible),
  ghost,
  selected,
  hovered,
})

export interface PreviewRect {
  left: number
  top: number
  width: number
  height: number
}

export function visibleRows(scene: ArrangementScene): VisibleRow[] {
  const bottom = arrangementBodyBottom(scene.viewport.height, scene.geometry.arrangement)
  const pinnedTop = Math.max(
    arrangementBodyTop(scene.geometry.arrangement),
    bottom - pinnedTrackHeight(scene.tracks, scene.geometry.track)
  )
  const result: VisibleRow[] = []
  for (const row of layoutTrackRows(scene)) {
    const clipTop = Math.max(
      row.top,
      isPinnedTrack(row.track) ? pinnedTop : arrangementBodyTop(scene.geometry.arrangement)
    )
    const clipBottom = Math.min(row.top + row.height, isPinnedTrack(row.track) ? bottom : pinnedTop)
    if (clipBottom > clipTop) result.push({ ...row, clipTop, clipBottom })
  }
  return result
}

export function visibleClipCards(
  scene: ArrangementScene,
  row: TrackRow,
  automationMode: boolean
): ClipCard[] {
  return projectVisibleClipCards(scene, row, automationMode, freshCard)
}

export function projectVisibleClipCards<T extends ClipCard>(
  scene: ArrangementScene,
  row: TrackRow,
  automationMode: boolean,
  project: ClipCardProjector<T>
): T[] {
  const { width, pxPerBar, scrollX } = scene.viewport
  if (width <= 0 || pxPerBar <= 0 || row.track.kind === "group") return []
  const source =
    scene.clipDrag?.source.find(track => track.id === row.track.id)?.clips ?? row.track.clips
  const cards: T[] = []
  for (const ghost of scene.clipDrag ? [false, true] : [false]) {
    for (const clip of ghost ? row.track.clips : source) {
      if (ghost && !scene.clipDrag?.ids.has(clip.id)) continue
      const rect = clipRect(clip, row, pxPerBar, scrollX)
      if (rect.left + rect.width <= 0 || rect.left >= width) continue
      const hovered = !scene.clipDrag && !automationMode && scene.hoverClip?.id === clip.id
      const selected = ghost
        ? !!scene.clipDrag?.ids.has(clip.id)
        : !scene.clipDrag && scene.selectedClipIds.has(clip.id)
      const card = project(
        rect,
        ghost,
        selected,
        hovered,
        !ghost && hovered && scene.hoverClip?.region === "body"
      )
      const geometry = card.geometry
      if (geometry.left + geometry.width <= 0 || geometry.left >= width) continue
      cards.push(card)
    }
  }
  return cards
}

export function midiPreviewRects(
  clip: MidiClip,
  geometry: Pick<ClipVisualGeometry, "left" | "width" | "bodyTop" | "bodyHeight">,
  numerator: number,
  viewportWidth: number,
  metrics: Theme["project"]
): PreviewRect[] {
  const { left, width, bodyTop, bodyHeight } = geometry
  if (!clip.notes.length || bodyHeight <= 0 || width <= 0) return []
  const sourceStart = (clip.sourceOffsetBars ?? 0) * numerator
  const sourceLength = clip.lengthBars * numerator
  const cycle = (clip.loopBars ?? clip.lengthBars) * numerator
  const visibleStart = sourceStart + (Math.max(0, -left) / width) * sourceLength
  const visibleEnd = sourceStart + (Math.min(width, viewportWidth - left) / width) * sourceLength
  if (visibleEnd <= visibleStart || cycle <= 0) return []
  let minPitch = Infinity
  let maxPitch = -Infinity
  for (const note of clip.notes) {
    minPitch = Math.min(minPitch, note.pitch)
    maxPitch = Math.max(maxPitch, note.pitch)
  }
  const pitchSpan = Math.max(1, maxPitch - minPitch)
  const rectangles: PreviewRect[] = []
  for (const note of clip.notes) {
    const phase = ((note.startBeat % cycle) + cycle) % cycle
    const duration = Math.min(note.lengthBeats, cycle)
    const first = Math.floor((visibleStart - phase - duration) / cycle) + 1
    const last = Math.ceil((visibleEnd - phase) / cycle)
    const top =
      bodyTop +
      metrics.arrangementPreviewNoteTopInset +
      ((maxPitch - note.pitch) / pitchSpan) *
        Math.max(0, bodyHeight - metrics.arrangementPreviewNoteInset)
    for (let repeat = first; repeat < last; repeat++) {
      const start = Math.max(sourceStart, phase + repeat * cycle)
      const end = Math.min(sourceStart + sourceLength, phase + repeat * cycle + duration)
      if (end <= start) continue
      const x = Math.max(0, left, left + ((start - sourceStart) / sourceLength) * width)
      const through = Math.min(
        viewportWidth,
        left + width,
        left + ((end - sourceStart) / sourceLength) * width
      )
      if (through > x)
        rectangles.push({
          left: x,
          top,
          width: through - x,
          height: Math.min(metrics.arrangementPreviewNoteHeight, bodyHeight),
        })
    }
  }
  return rectangles
}

export function patternPreviewRects(
  clip: PatternClip,
  geometry: Pick<ClipVisualGeometry, "left" | "width" | "bodyTop" | "bodyHeight">,
  viewportWidth: number,
  metrics: Theme["project"]
): PreviewRect[] {
  const { left, width, bodyTop, bodyHeight } = geometry
  const steps = clip.steps
  if (!steps?.length || bodyHeight <= 0 || width <= 0) return []
  const source = patternWindow(clip)
  const cellWidth = width / (clip.lengthBars * PATTERN_STEPS_PER_BAR)
  const top = Math.round(
    bodyTop + Math.max(0, (bodyHeight - metrics.arrangementPreviewNoteHeight) / 2)
  )
  const result: PreviewRect[] = []
  if (cellWidth < 1) {
    for (let x = Math.ceil(Math.max(0, left)); x < Math.min(viewportWidth, left + width); x++) {
      const from = source.origin + (x - left) / cellWidth
      const end = source.origin + (Math.min(x + 1, left + width) - left) / cellWidth
      if (patternHasActivity(steps, from, end))
        result.push({
          left: x,
          top,
          width: 1,
          height: Math.min(metrics.arrangementPreviewNoteHeight, bodyHeight),
        })
    }
    return result
  }
  const first = Math.max(source.first, Math.floor(source.origin + Math.max(0, -left) / cellWidth))
  const end = Math.min(
    source.end,
    Math.ceil(source.origin + Math.min(width, viewportWidth - left) / cellWidth)
  )
  for (let index = first; index < end; index++) {
    if (steps[((index % steps.length) + steps.length) % steps.length] !== true) continue
    const x = Math.max(0, left, left + (index - source.origin) * cellWidth)
    const through = Math.min(
      viewportWidth,
      left + width,
      left + (index + 1 - source.origin) * cellWidth
    )
    if (through > x)
      result.push({
        left: x,
        top,
        width: Math.max(1, Math.min(cellWidth - metrics.arrangementPreviewStepGap, through - x)),
        height: Math.min(metrics.arrangementPreviewNoteHeight, bodyHeight),
      })
  }
  return result
}

export function clipLoopTicks(
  clip: Clip,
  geometry: Pick<ClipVisualGeometry, "left" | "width">,
  viewportWidth: number,
  metrics: Theme["project"]
): number[] {
  const period =
    clip.kind === "midi"
      ? (clip.loopBars ?? clip.lengthBars)
      : clip.kind === "pattern"
        ? (clip.steps?.length || PATTERN_STEPS_PER_BAR) / PATTERN_STEPS_PER_BAR
        : clip.audioSettings?.loop
          ? clip.audioSettings.loopLengthBars
          : null
  const { left, width } = geometry
  if (
    !period ||
    width <= 0 ||
    (period / clip.lengthBars) * width < metrics.arrangementLoopTickMinSpacing
  )
    return []
  const sourceStart = clip.sourceOffsetBars ?? 0
  const from = sourceStart + (Math.max(0, -left) / width) * clip.lengthBars
  const through = sourceStart + (Math.min(width, viewportWidth - left) / width) * clip.lengthBars
  const ticks: number[] = []
  for (let cycle = Math.floor(from / period) + 1; cycle * period < through; cycle++) {
    const x = left + ((cycle * period - sourceStart) / clip.lengthBars) * width
    if (
      x > left + metrics.arrangementLoopTickEdgeInset &&
      x < left + width - metrics.arrangementLoopTickEdgeInset
    )
      ticks.push(Math.round(x))
  }
  return ticks
}
