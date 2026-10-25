function rgb(color: string): number[] | null {
  const values = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (values) return values.slice(1, 4).map(Number)
  const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  return srgb ? srgb.slice(1, 4).map(value => Number(value) * 255) : null
}

export function createInsertionPulse(
  base: string,
  highlight: string
): (elapsedMs: number) => string {
  const start = rgb(base)
  const end = rgb(highlight)
  if (!start || !end) return () => base
  const colors = Array.from(
    { length: 256 },
    (_, index) =>
      `rgb(${start.map((value, channel) => Math.round(value + (((end[channel] - value) * index) / 255) * 0.5)).join(", ")})`
  )
  return elapsedMs => {
    const phase = (((elapsedMs % 1200) + 1200) % 1200) / 1200
    return colors[Math.floor(2 * Math.min(phase, 1 - phase) * 255)]
  }
}
