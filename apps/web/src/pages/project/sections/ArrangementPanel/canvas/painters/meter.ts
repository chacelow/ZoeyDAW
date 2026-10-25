import {
  advanceMeterPeak,
  createMeterPeak,
  meterDb as clampDecibels,
  METER_MAX_DB,
  METER_MIN_DB,
} from "./meter-peak"
import type { MeterPeak } from "./meter-peak"
export interface MeterTokens {
  background: string
  good: string
  warn: string
  danger: string
  line: string
  peak: string
}

export interface MeterGeometry {
  width: number
  height: number
  dpr: number
}

export interface MeterPaintState {
  left: MeterPeak
  right: MeterPeak
  gradient: {
    height: number
    dpr: number
    good: string
    warn: string
    danger: string
    fill: CanvasGradient
  } | null
}

export function createMeterPaintState(): MeterPaintState {
  return { left: createMeterPeak(), right: createMeterPeak(), gradient: null }
}

export function paintMeter(
  context: CanvasRenderingContext2D,
  tokens: MeterTokens,
  geometry: MeterGeometry,
  state: MeterPaintState,
  now: number,
  levels: readonly [number, number]
): boolean {
  const { width, height, dpr } = geometry
  if (width <= 0 || height <= 0) {
    return false
  }
  const [left, right] = levels
  advanceMeterPeak(state.left, left, now)
  advanceMeterPeak(state.right, right, now)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  const zeroY = Math.min(height - 1, Math.round(decibelY(0, height)))
  if (
    !state.gradient ||
    state.gradient.height !== height ||
    state.gradient.dpr !== dpr ||
    state.gradient.good !== tokens.good ||
    state.gradient.warn !== tokens.warn ||
    state.gradient.danger !== tokens.danger
  ) {
    const fill = context.createLinearGradient(0, height, 0, zeroY)
    fill.addColorStop(0, tokens.good)
    fill.addColorStop(0.45, tokens.good)
    fill.addColorStop(0.75, tokens.warn)
    fill.addColorStop(1, `color-mix(in srgb, ${tokens.danger} 75%, ${tokens.warn})`)
    state.gradient = {
      height,
      dpr,
      good: tokens.good,
      warn: tokens.warn,
      danger: tokens.danger,
      fill,
    }
  }
  context.fillStyle = tokens.background
  context.fillRect(0, 0, width, height)

  const columnW = Math.floor((width - 1) / 2)
  drawColumn(context, 0, columnW, height, zeroY, left, state.left.db, tokens, state.gradient.fill)
  drawColumn(
    context,
    columnW + 1,
    width - columnW - 1,
    height,
    zeroY,
    right,
    state.right.db,
    tokens,
    state.gradient.fill
  )
  context.fillStyle = tokens.line
  context.fillRect(columnW, 0, 1, height)
  context.fillRect(0, zeroY, width, 1)
  return state.left.db > METER_MIN_DB || state.right.db > METER_MIN_DB
}

function drawColumn(
  context: CanvasRenderingContext2D,
  x: number,
  width: number,
  height: number,
  zeroY: number,
  dbfs: number,
  peakDatabase: number,
  tokens: MeterTokens,
  gradient: CanvasGradient
) {
  const top = Math.round(decibelY(dbfs, height))
  const belowZero = Math.max(top, zeroY + 1)
  context.fillStyle = gradient
  context.fillRect(x, belowZero, width, height - belowZero)
  if (top < zeroY) {
    context.fillStyle = tokens.danger
    context.fillRect(x, top, width, zeroY - top)
  }
  if (!(peakDatabase > METER_MIN_DB)) {
    return
  }

  context.fillStyle = tokens.peak
  context.fillRect(x, Math.min(height - 1, Math.round(decibelY(peakDatabase, height))), width, 1)
}

function decibelY(levelDb: number, height: number): number {
  return height * (1 - (clampDecibels(levelDb) - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB))
}
