export const GRID_DENSITIES = ["widest", "wide", "medium", "narrow", "narrowest"] as const
export type GridDensity = (typeof GRID_DENSITIES)[number]
export type GridSettings =
  { mode: "adaptive"; density: GridDensity } | { mode: "fixed"; bars: number }

export const DEFAULT_GRID: GridSettings = { mode: "adaptive", density: "medium" }
export const MAX_NOTE_DENOMINATOR = 16_384
export const MIN_CLIP_LENGTH_BARS = 1 / (MAX_NOTE_DENOMINATOR * 32)
const DENSITY_MIN_WIDTH = [128, 64, 32, 16, 8] as const
const FIXED_BAR_STEPS = [16, 8, 4, 2, 1] as const
const FIXED_NOTE_DENOMINATORS = [2, 4, 8, 16, 32, 64, 128, 256] as const

export interface GridPlan {
  cellBars: number
  label: string
  /**
  Bar boundaries, beat boundaries, then the remaining cell boundaries share origin bar 1.
  */
  barBars: number
  beatBars: number
  minimumCellPx: number
}

export function noteGridBars(
  noteDenominator: number,
  numerator: number,
  meterDenominator: number
): number {
  return meterDenominator / (numerator * noteDenominator)
}

export function gridLabel(bars: number, numerator: number, denominator: number): string {
  if (bars >= 1) {
    return `${bars} ${bars === 1 ? "Bar" : "Bars"}`
  }
  const wholeNotes = (bars * numerator) / denominator
  const reciprocal = 1 / wholeNotes
  return Number.isInteger(reciprocal) ? `1/${reciprocal}` : `${wholeNotes}`
}

export function fixedGridSteps(numerator: number, denominator: number) {
  const steps = [
    ...FIXED_BAR_STEPS.map(bars => ({ bars, label: `${bars} ${bars === 1 ? "Bar" : "Bars"}` })),
    ...FIXED_NOTE_DENOMINATORS.map(note => ({
      bars: noteGridBars(note, numerator, denominator),
      label: `1/${note}`,
    })),
  ]
  return steps.filter(
    (step, index) => steps.findIndex(candidate => candidate.bars === step.bars) === index
  )
}

/**
Legacy v1 snapshots stored explicit bar durations, including older bar-based choices.
*/
export function isLegacyGridBars(bars: number, numerator: number, denominator: number): boolean {
  return (
    Number.isFinite(bars) &&
    bars > 0 &&
    ([0.25, 0.5, 1, 2, 4, 8, 16].includes(bars) ||
      [2, 4, 8, 16, 32, 64, 128, 256].some(
        note => noteGridBars(note, numerator, denominator) === bars
      ))
  )
}

export function isGridSettings(value: unknown): value is GridSettings {
  if (typeof value !== "object" || value === null) {
    return false
  }
  if ("mode" in value && value.mode === "adaptive") {
    return "density" in value && GRID_DENSITIES.some(density => density === value.density)
  }
  return "mode" in value && value.mode === "fixed"
    ? "bars" in value &&
        typeof value.bars === "number" &&
        Number.isFinite(value.bars) &&
        value.bars >= MIN_CLIP_LENGTH_BARS &&
        value.bars <= 1024
    : false
}

/**
Zoom affects only this projection, never the persisted workspace or its undo history.
*/
export function deriveGridPlan(
  settings: GridSettings,
  pxPerBar: number,
  numerator: number,
  denominator: number
): GridPlan {
  const beatBars = 1 / numerator
  const minimumCellPx =
    settings.mode === "adaptive" ? DENSITY_MIN_WIDTH[GRID_DENSITIES.indexOf(settings.density)] : 8
  let cellBars: number
  if (settings.mode === "fixed") {
    cellBars = settings.bars
  } else {
    const requiredBars = minimumCellPx / pxPerBar
    if (requiredBars >= 1) {
      cellBars = 2 ** Math.ceil(Math.log2(requiredBars))
    } else {
      const pxPerWholeNote = (pxPerBar * denominator) / numerator
      const note = Math.min(
        MAX_NOTE_DENOMINATOR,
        Math.max(1, 2 ** Math.floor(Math.log2(pxPerWholeNote / minimumCellPx)))
      )
      const noteCellBars = noteGridBars(note, numerator, denominator)
      cellBars = noteCellBars * 2 ** Math.max(0, Math.ceil(Math.log2(requiredBars / noteCellBars)))
      if (cellBars >= 1) {
        cellBars = 2 ** Math.ceil(Math.log2(cellBars))
      }
    }
  }
  return {
    cellBars,
    label: gridLabel(cellBars, numerator, denominator),
    barBars: 1,
    beatBars,
    minimumCellPx,
  }
}

export function adjustGrid(
  settings: GridSettings,
  direction: -1 | 1,
  numerator: number,
  denominator: number
): GridSettings {
  if (settings.mode === "adaptive") {
    const index = GRID_DENSITIES.indexOf(settings.density)
    const density =
      GRID_DENSITIES[Math.max(0, Math.min(GRID_DENSITIES.length - 1, index - direction))]
    return density === settings.density ? settings : { mode: "adaptive", density }
  }
  const steps = [
    ...new Set([...fixedGridSteps(numerator, denominator).map(step => step.bars), settings.bars]),
  ].sort((a, b) => a - b)
  const index = steps.indexOf(settings.bars)
  const next = steps[Math.max(0, Math.min(steps.length - 1, index + direction))]
  return next === settings.bars ? settings : { mode: "fixed", bars: next }
}

export function gridForMeterChange(
  settings: GridSettings,
  oldNumerator: number,
  oldDenominator: number,
  numerator: number,
  denominator: number
): GridSettings {
  if (settings.mode === "adaptive" || settings.bars >= 0.25) {
    return settings
  }
  const oldWholeNote = (settings.bars * oldNumerator) / oldDenominator
  return {
    mode: "fixed",
    bars: Math.max(MIN_CLIP_LENGTH_BARS, Math.min(1024, (oldWholeNote * denominator) / numerator)),
  }
}

/**
Keep a 1/16384 note at least 8 logical pixels wide at maximum zoom.
*/
export function gridZoomLimit(numerator: number, denominator: number): number {
  return (8 * MAX_NOTE_DENOMINATOR * numerator) / denominator
}
