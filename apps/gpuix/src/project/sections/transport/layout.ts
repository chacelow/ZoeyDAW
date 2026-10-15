export interface TransportMeasurements {
  readonly viewport: number
  readonly left: number
  readonly center: number
  readonly right: number
}

export function transportColumns(measured: TransportMeasurements, gap: number) {
  const remaining = measured.viewport - measured.center - gap * 2
  const half = remaining / 2
  const left = Math.max(measured.left, Math.min(half, remaining - measured.right))
  const right = Math.max(measured.right, Math.min(half, remaining - measured.left))
  return { left, right, content: left + measured.center + right + gap * 2 }
}
