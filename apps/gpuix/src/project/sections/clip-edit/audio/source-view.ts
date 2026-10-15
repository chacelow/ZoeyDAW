import type { AudioClipSettings } from "@/project/model/audio-editor"
import type { AudioClip } from "@/project/model/types"

/** Visible source range in zero-based source bars. */
export interface SourceView {
  readonly start: number
  readonly span: number
}

/** Narrowest view: 1/16384 bar, the Arrangement's deepest zoom. */
export const MIN_SOURCE_SPAN = 1 / 16_384

/** Union of the retained source window, loop window and playback markers. */
export function sourceRange(clip: AudioClip, settings: AudioClipSettings): SourceView {
  const sourceStart = clip.sourceOffsetBars ?? 0
  const start = Math.min(sourceStart, settings.loopStartBars, settings.startMarkerBars)
  const end = Math.max(
    sourceStart + clip.lengthBars,
    settings.loopStartBars + settings.loopLengthBars,
    settings.endMarkerBars
  )
  return { start, span: end - start }
}

/** Pan and zoom bounds: never before zero or the range start, never wider than four ranges. */
export function sourceBounds(range: SourceView) {
  return { minimum: Math.min(0, range.start), maxSpan: Math.max(1, range.span * 4) }
}

/** Zoom by `factor` (>1 narrows) keeping the source position at `anchor` (0..1 of the view) fixed. */
export function zoomSource(
  view: SourceView,
  range: SourceView,
  factor: number,
  anchor: number
): SourceView {
  const { minimum, maxSpan } = sourceBounds(range)
  const span = Math.max(MIN_SOURCE_SPAN, Math.min(maxSpan, view.span / factor))
  const clamped = Math.max(0, Math.min(1, anchor))
  return { start: Math.max(minimum, view.start + (view.span - span) * clamped), span }
}

export function panSource(view: SourceView, range: SourceView, delta: number): SourceView {
  return { ...view, start: Math.max(sourceBounds(range).minimum, view.start + delta) }
}

/** Overview extent: everything the user can scroll to, including the current view. */
export function overviewExtent(range: SourceView, view: SourceView): SourceView {
  const minimum = sourceBounds(range).minimum
  const end = Math.max(range.start + range.span, view.start + view.span)
  return { start: minimum, span: Math.max(MIN_SOURCE_SPAN, end - minimum) }
}

/**
Musical ruler step: the smallest power-of-two bar fraction that leaves `minLabelPx` between labels,
never finer than a 1/64 bar.
*/
export function sourceTickStep(view: SourceView, width: number, minLabelPx: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max((view.span * minLabelPx) / Math.max(1, width), 1 / 64)))
}

export function sourceTicks(view: SourceView, step: number): number[] {
  const first = Math.ceil(view.start / step) * step
  const ticks: number[] = []
  for (let value = first; value <= view.start + view.span && ticks.length < 128; value += step)
    ticks.push(value)
  return ticks
}
