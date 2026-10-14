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

export interface RulerTick {
  bar: number
  x: number
}

/** Readable labels may subdivide a bar; they never create canvas Pattern lines. */
export function rulerTicks(scene: ArrangementScene): RulerTick[] {
  const { pxPerBar, scrollX, width } = scene.viewport
  if (!(pxPerBar > 0) || !(width > 0)) return []
  const { stepBars } = numberedRulerPlan(
    pxPerBar,
    scene.transport.numerator,
    scene.transport.denominator
  )
  const stepPx = stepBars * pxPerBar
  const first = Math.max(0, Math.ceil(scrollX / stepPx))
  const last = Math.min(Math.floor(scene.bars / stepBars), Math.floor((scrollX + width) / stepPx))
  const ticks: RulerTick[] = []
  for (let index = first; index <= last; index++) {
    ticks.push({ bar: 1 + index * stepBars, x: Math.round(index * stepPx - scrollX) + 0.5 })
  }
  return ticks
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
  if (!(pxPerBar > 0) || right < left) return []
  const patternVisible = pxPerBar >= 1
  const { cellBars } = scene.gridPlan
  const cellPx = cellBars * pxPerBar
  const lines: GridLine[] = []
  if (cellPx >= 2) {
    const first = Math.max(0, Math.ceil((scrollX + left) / cellPx))
    const last = Math.min(Math.floor(scene.bars / cellBars), Math.floor((scrollX + right) / cellPx))
    for (let cell = first; cell <= last; cell++) {
      const offset = cell * cellBars
      if (patternVisible && Math.abs(offset - Math.round(offset)) < 1e-8) continue
      lines.push({ bar: 1 + offset, x: Math.round(cell * cellPx - scrollX) + 0.5, kind: "minor" })
    }
  }
  if (patternVisible) {
    const first = Math.max(0, Math.ceil((scrollX + left) / pxPerBar))
    const last = Math.min(Math.floor(scene.bars), Math.floor((scrollX + right) / pxPerBar))
    for (let bar = first; bar <= last; bar++) {
      lines.push({ bar: 1 + bar, x: Math.round(bar * pxPerBar - scrollX) + 0.5, kind: "major" })
    }
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
  if (!(pxPerBar >= 1) || !(width > 0)) return []
  const step = 1
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
