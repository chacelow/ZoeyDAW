import type { ArrangementScene } from "../scene"

export function numberedRulerPlan(
  pxPerBar: number,
  numerator: number
): { mode: "sixteenth" | "beat" | "bar"; stepBars: number } {
  if (pxPerBar / (numerator * 4) >= 38) return { mode: "sixteenth", stepBars: 1 / (numerator * 4) }
  if (pxPerBar / numerator >= 56) return { mode: "beat", stepBars: 1 / numerator }
  return { mode: "bar", stepBars: pxPerBar >= 56 ? 1 : 2 ** Math.ceil(Math.log2(56 / pxPerBar)) }
}

export interface GridLine {
  bar: number
  x: number
  kind: "minor" | "major"
}

export function gridLines(
  scene: ArrangementScene,
  left = 0,
  right = scene.viewport.width
): GridLine[] {
  const { pxPerBar, scrollX } = scene.viewport
  if (pxPerBar <= 0 || right < left) return []
  const { stepBars: majorBars } = numberedRulerPlan(pxPerBar, scene.transport.numerator)
  const { cellBars } = scene.gridPlan
  const cellPx = cellBars * pxPerBar
  const majorPx = majorBars * pxPerBar
  const lines: GridLine[] = []
  if (cellPx >= 2) {
    const first = Math.max(0, Math.ceil((scrollX + left) / cellPx))
    const last = Math.min(Math.floor(scene.bars / cellBars), Math.floor((scrollX + right) / cellPx))
    for (let cell = first; cell <= last; cell++) {
      const offset = cell * cellBars
      if (Math.abs(offset / majorBars - Math.round(offset / majorBars)) < 1e-8) continue
      lines.push({ bar: 1 + offset, x: Math.round(cell * cellPx - scrollX) + 0.5, kind: "minor" })
    }
  }
  const first = Math.max(0, Math.ceil((scrollX + left) / majorPx))
  const last = Math.min(Math.floor(scene.bars / majorBars), Math.floor((scrollX + right) / majorPx))
  for (let tick = first; tick <= last; tick++) {
    lines.push({
      bar: 1 + tick * majorBars,
      x: Math.round(tick * majorPx - scrollX) + 0.5,
      kind: "major",
    })
  }
  return lines
}
