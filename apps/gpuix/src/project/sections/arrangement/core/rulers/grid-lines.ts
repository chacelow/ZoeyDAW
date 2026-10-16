import { MIN_GRID_CELL_PX } from "@/project/model/grid"

import type { ArrangementGeometry, ArrangementScene } from "../scene"

export function numberedRulerPlan(
  pxPerBar: number,
  numerator: number,
  denominator: number,
  spacing: ArrangementGeometry["arrangement"]["rulerLabelSpacing"]
): { mode: "sixteenth" | "beat" | "bar"; stepBars: number } {
  const subdivisionsPerBar = (numerator * 16) / denominator
  if (pxPerBar / subdivisionsPerBar >= spacing.subdivision) {
    return { mode: "sixteenth", stepBars: 1 / subdivisionsPerBar }
  }
  if (pxPerBar / numerator >= spacing.beat) {
    return { mode: "beat", stepBars: 1 / numerator }
  }
  return {
    mode: "bar",
    stepBars: pxPerBar >= spacing.bar ? 1 : 2 ** Math.ceil(Math.log2(spacing.bar / pxPerBar)),
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
    scene.transport.denominator,
    scene.geometry.arrangement.rulerLabelSpacing
  )
  const stepPx = stepBars * pxPerBar
  const first = Math.max(0, Math.ceil(scrollX / stepPx))
  const last = Math.min(Math.floor(scene.bars / stepBars), Math.floor((scrollX + width) / stepPx))
  const ticks: RulerTick[] = []
  for (let index = first; index <= last; index++) {
    // Half-pixel centers are the native raster coordinate convention, not a density preference.
    ticks.push({ bar: 1 + index * stepBars, x: Math.round(index * stepPx - scrollX) + 0.5 })
  }
  return ticks
}

export interface GridLine {
  bar: number
  x: number
  kind: "minor" | "major"
}

/** Only unreadable whole bars aggregate; label cadence and grid preferences never choose this step. */
function patternStepBars(pxPerBar: number, minimumCellPx: number): number {
  return Math.max(1, 2 ** Math.ceil(Math.log2(minimumCellPx / pxPerBar)))
}

export function gridLines(
  scene: ArrangementScene,
  left = 0,
  right = scene.viewport.width
): GridLine[] {
  const { pxPerBar, scrollX } = scene.viewport
  if (!(pxPerBar > 0) || right < left) return []
  const majorBars = patternStepBars(pxPerBar, MIN_GRID_CELL_PX)
  const majorPx = majorBars * pxPerBar
  const { cellBars } = scene.gridPlan
  const cellPx = cellBars * pxPerBar
  const lines: GridLine[] = []
  if (cellPx >= scene.geometry.arrangement.gridMinSubdivisionWidth) {
    const first = Math.max(0, Math.ceil((scrollX + left) / cellPx))
    const last = Math.min(Math.floor(scene.bars / cellBars), Math.floor((scrollX + right) / cellPx))
    for (let cell = first; cell <= last; cell++) {
      const offset = cell * cellBars
      // Floating-point equality tolerance and half-pixel raster centers are numerical constants.
      if (Math.abs(offset / majorBars - Math.round(offset / majorBars)) < 1e-8) continue
      lines.push({ bar: 1 + offset, x: Math.round(cell * cellPx - scrollX) + 0.5, kind: "minor" })
    }
  }
  const first = Math.max(0, Math.ceil((scrollX + left) / majorPx))
  const last = Math.min(Math.floor(scene.bars / majorBars), Math.floor((scrollX + right) / majorPx))
  for (let bar = first; bar <= last; bar++) {
    lines.push({
      bar: 1 + bar * majorBars,
      x: Math.round(bar * majorPx - scrollX) + 0.5,
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
  const step = patternStepBars(pxPerBar, MIN_GRID_CELL_PX)
  const regionWidth = step * pxPerBar
  const first = Math.max(0, Math.floor(scrollX / regionWidth))
  const last = Math.min(
    Math.ceil(scene.bars / step) - 1,
    Math.ceil((scrollX + width) / regionWidth) - 1
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
