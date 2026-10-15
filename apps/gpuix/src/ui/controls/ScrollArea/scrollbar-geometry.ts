export interface ScrollbarGeometry {
  maximum: number
  value: number
  thumb: number
  offset: number
  travel: number
}

export function scrollbarGeometry(
  value: number,
  viewport: number,
  extent: number,
  length: number,
  minimumThumb: number
): ScrollbarGeometry {
  const maximum = Math.max(0, extent - viewport)
  const bounded = Math.max(0, Math.min(maximum, value))
  const thumb = Math.min(
    length,
    Math.max(minimumThumb, extent > 0 ? (length * viewport) / extent : length)
  )
  const travel = Math.max(0, length - thumb)
  return {
    maximum,
    value: bounded,
    thumb,
    offset: maximum > 0 ? (bounded / maximum) * travel : 0,
    travel,
  }
}
