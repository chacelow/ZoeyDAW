export function snapControlWidth(width: number, unit: number): number {
  return Math.max(1, Math.ceil(width / unit)) * unit
}
