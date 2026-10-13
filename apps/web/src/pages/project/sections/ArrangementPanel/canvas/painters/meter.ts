import type { AudioRingBuffer } from "../audio/ring-buffer"
import {
  advanceMeterPeak,
  createMeterPeak,
  meterDb,
  METER_MAX_DB,
  METER_MIN_DB,
  type MeterPeak,
} from "./meter-peak"

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
  gradient: { height: number; dpr: number; good: string; warn: string; fill: CanvasGradient } | null
}

export function createMeterPaintState(): MeterPaintState {
  return { left: createMeterPeak(), right: createMeterPeak(), gradient: null }
}

export function paintMeter(
  ctx: CanvasRenderingContext2D,
  trackId: string,
  ring: AudioRingBuffer,
  tokens: MeterTokens,
  geometry: MeterGeometry,
  state: MeterPaintState,
  now: number
): boolean {
  const { width, height, dpr } = geometry
  if (width <= 0 || height <= 0) return false
  const meter = ring.readMeter(trackId)
  advanceMeterPeak(state.left, meter.left, now)
  advanceMeterPeak(state.right, meter.right, now)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const zeroY = Math.min(height - 1, Math.round(dbY(0, height)))
  if (
    !state.gradient ||
    state.gradient.height !== height ||
    state.gradient.dpr !== dpr ||
    state.gradient.good !== tokens.good ||
    state.gradient.warn !== tokens.warn
  ) {
    const fill = ctx.createLinearGradient(0, height, 0, zeroY)
    fill.addColorStop(0, tokens.good)
    fill.addColorStop(0.7, tokens.good)
    fill.addColorStop(1, tokens.warn)
    state.gradient = { height, dpr, good: tokens.good, warn: tokens.warn, fill }
  }
  ctx.fillStyle = tokens.background
  ctx.fillRect(0, 0, width, height)

  const columnW = Math.floor((width - 1) / 2)
  drawColumn(ctx, 0, columnW, height, zeroY, meter.left, state.left.db, tokens, state.gradient.fill)
  drawColumn(
    ctx,
    columnW + 1,
    width - columnW - 1,
    height,
    zeroY,
    meter.right,
    state.right.db,
    tokens,
    state.gradient.fill
  )
  ctx.fillStyle = tokens.line
  ctx.fillRect(columnW, 0, 1, height)
  ctx.fillRect(0, zeroY, width, 1)
  return state.left.db > METER_MIN_DB || state.right.db > METER_MIN_DB
}

function drawColumn(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  height: number,
  zeroY: number,
  dbfs: number,
  peakDb: number,
  tokens: MeterTokens,
  gradient: CanvasGradient
) {
  const top = Math.round(dbY(dbfs, height))
  const belowZero = Math.max(top, zeroY + 1)
  ctx.fillStyle = gradient
  ctx.fillRect(x, belowZero, width, height - belowZero)
  if (top < zeroY) {
    ctx.fillStyle = tokens.danger
    ctx.fillRect(x, top, width, zeroY - top)
  }
  if (peakDb > METER_MIN_DB) {
    ctx.fillStyle = tokens.peak
    ctx.fillRect(x, Math.min(height - 1, Math.round(dbY(peakDb, height))), width, 1)
  }
}

function dbY(db: number, height: number): number {
  return height * (1 - (meterDb(db) - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB))
}
