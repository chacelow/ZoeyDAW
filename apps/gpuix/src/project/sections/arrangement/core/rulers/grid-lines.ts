import type { ArrangementScene } from "../scene"

/** Readability defaults inherited from web; only the 4/8 subdivision hierarchy is Live-observed. */
export const RULER_LABEL_SPACING = { subdivision: 38, beat: 56, bar: 56 } as const

export function numberedRulerPlan(
  pxPerBar: number,
  numerator: number,
  denominator = 4
): { mode: "sixteenth" | "beat" | "bar"; stepBars: number } {
  const subdivisionsPerBar = (numerator * 16) / denominator
  if (pxPerBar / subdivisionsPerBar >= RULER_LABEL_SPACING.subdivision) {
    return { mode: "sixteenth", stepBars: 1 / subdivisionsPerBar }
  }
  if (pxPerBar / numerator >= RULER_LABEL_SPACING.beat) {
    return { mode: "beat", stepBars: 1 / numerator }
  }
  return {
    mode: "bar",
    stepBars:
      pxPerBar >= RULER_LABEL_SPACING.bar
        ? 1
        : 2 ** Math.ceil(Math.log2(RULER_LABEL_SPACING.bar / pxPerBar)),
  }
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
  const { stepBars: majorBars } = numberedRulerPlan(
    pxPerBar,
    scene.transport.numerator,
    scene.transport.denominator
  )
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

export interface PatternRegion {
  bar: number
  left: number
  width: number
  alternate: boolean
}

/** Pattern regions follow numbered bars, never the finer grid cells. */
export function patternRegions(scene: ArrangementScene): PatternRegion[] {
  const { pxPerBar, scrollX, width } = scene.viewport
  if (!(pxPerBar > 0) || !(width > 0)) return []
  const step = Math.max(
    1,
    numberedRulerPlan(pxPerBar, scene.transport.numerator, scene.transport.denominator).stepBars
  )
  const regionWidth = step * pxPerBar
  const first = Math.max(0, Math.floor(scrollX / regionWidth))
  const last = Math.min(
    Math.ceil(scene.bars / step) - 1,
    Math.floor((scrollX + width) / regionWidth)
  )
  const regions: PatternRegion[] = []
  for (let index = first; index <= last; index++) {
    const left = index * regionWidth - scrollX
    regions.push({
      bar: 1 + index * step,
      left: Math.max(0, left),
      width: Math.max(0, Math.min(width, left + regionWidth) - Math.max(0, left)),
      alternate: index % 2 !== 0,
    })
  }
  return regions
}
