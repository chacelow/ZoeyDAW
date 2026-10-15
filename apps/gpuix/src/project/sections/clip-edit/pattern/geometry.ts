export interface PatternGeometry {
  readonly count: number
  readonly viewport: number
  readonly gap: number
  readonly stepWidth: number
  readonly stride: number
  readonly extent: number
  readonly maximum: number
  readonly offset: number
  readonly first: number
  readonly end: number
}

export function patternGeometry({
  count,
  viewport,
  gap,
  border,
  minimum,
  offset,
}: {
  count: number
  viewport: number
  gap: number
  border: number
  minimum: number
  offset: number
}): PatternGeometry {
  const stepWidth = Math.max(minimum, border * 2, (viewport - gap * Math.max(0, count - 1)) / count)
  const stride = stepWidth + gap
  const extent = stepWidth * count + gap * Math.max(0, count - 1)
  const maximum = Math.max(0, extent - viewport)
  const bounded = Math.max(0, Math.min(maximum, offset))
  let first = Math.min(count, Math.max(0, Math.floor(bounded / stride)))
  if (first < count && first * stride + stepWidth <= bounded) first++
  const end = viewport > 0 ? Math.min(count, Math.ceil((bounded + viewport) / stride)) : first
  return {
    count,
    viewport,
    gap,
    stepWidth,
    stride,
    extent,
    maximum,
    offset: bounded,
    first,
    end: Math.max(first, end),
  }
}

/** The same viewport-local rectangle is used for drawing, picking and keyboard reveal. */
export function patternStepRect(geometry: PatternGeometry, index: number) {
  return { x: index * geometry.stride - geometry.offset, width: geometry.stepWidth }
}

export function patternStepAt(geometry: PatternGeometry, clientX: number): number {
  const x = Math.max(0, Math.min(geometry.viewport, clientX))
  let index = Math.max(
    0,
    Math.min(geometry.count - 1, Math.floor((x + geometry.offset) / geometry.stride))
  )
  const rect = patternStepRect(geometry, index)
  if (index + 1 < geometry.count && x > rect.x + rect.width + geometry.gap / 2) index++
  return Math.max(geometry.first, Math.min(Math.max(geometry.first, geometry.end - 1), index))
}

export function patternScrollToStep(geometry: PatternGeometry, index: number): number {
  const rect = patternStepRect(geometry, index)
  const next =
    rect.x < 0
      ? index * geometry.stride
      : rect.x + rect.width > geometry.viewport
        ? index * geometry.stride + rect.width - geometry.viewport
        : geometry.offset
  return Math.max(0, Math.min(geometry.maximum, next))
}
