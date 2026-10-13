import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

/** Transport's one-based beat notation omits the first beat of each bar. */
export function formatBarBeat(bar: number, beat: number): string {
  return beat === 1 ? String(bar) : `${bar}.${beat}`
}

export function numberedRulerPlan(pxPerBar: number, numerator: number) {
  const pxPerSixteenth = pxPerBar / (numerator * 4)
  if (pxPerSixteenth >= 38) return { mode: "sixteenth" as const, stepBars: 1 / (numerator * 4) }
  const pxPerBeat = pxPerBar / numerator
  if (pxPerBeat >= 56) return { mode: "beat" as const, stepBars: 1 / numerator }
  const stepBars = pxPerBar >= 56 ? 1 : 2 ** Math.ceil(Math.log2(56 / pxPerBar))
  return { mode: "bar" as const, stepBars }
}

export function paintLoopRuler(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  ctx.fillStyle = tokens.ruler
  ctx.fillRect(0, MARKER_RULER_HEIGHT, width, LOOP_RULER_HEIGHT)
  ctx.fillStyle = tokens.mutedForeground
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
  ctx.textBaseline = "middle"
  const numerator = scene.transport.numerator
  const plan = numberedRulerPlan(pxPerBar, numerator)
  const sixteenthLabels = plan.mode === "sixteenth"
  const beatLabels = plan.mode === "beat"
  const step = plan.stepBars
  const tickWidth = pxPerBar * step
  const firstTick = Math.max(0, Math.ceil(scrollX / tickWidth))
  const lastTick = Math.min(
    sixteenthLabels
      ? scene.bars * numerator * 4
      : beatLabels
        ? scene.bars * numerator
        : Math.floor(scene.bars / step),
    Math.floor((scrollX + width) / tickWidth)
  )
  for (let tick = firstTick; tick <= lastTick; tick++) {
    const x = Math.round(tick * tickWidth - scrollX)
    const bar = sixteenthLabels
      ? Math.floor(tick / (numerator * 4)) + 1
      : beatLabels
        ? Math.floor(tick / numerator) + 1
        : tick * step + 1
    const beat = sixteenthLabels
      ? Math.floor((tick % (numerator * 4)) / 4) + 1
      : beatLabels
        ? (tick % numerator) + 1
        : 1
    const subdivision = sixteenthLabels ? (tick % 4) + 1 : 1
    const label = subdivision === 1 ? formatBarBeat(bar, beat) : `${bar}.${beat}.${subdivision}`
    ctx.fillText(label, x + 4, MARKER_RULER_HEIGHT + LOOP_RULER_HEIGHT / 2)
  }
  const loop = scene.loop
  if (loop.enabled) {
    const x0 = (loop.startBar - 1) * pxPerBar - scrollX
    const x1 = (loop.endBar - 1) * pxPerBar - scrollX
    if (x1 >= 0 && x0 <= width) {
      ctx.fillStyle = tokens.primary
      ctx.globalAlpha = 0.18
      ctx.fillRect(
        Math.max(0, x0),
        MARKER_RULER_HEIGHT,
        Math.max(0, Math.min(width, x1) - Math.max(0, x0)),
        LOOP_RULER_HEIGHT
      )
      ctx.globalAlpha = 1
      ctx.strokeStyle = tokens.primary
      ctx.beginPath()
      ctx.moveTo(x0 + 0.5, MARKER_RULER_HEIGHT)
      ctx.lineTo(x0 + 0.5, BAR_RULER_HEIGHT)
      ctx.moveTo(x1 - 0.5, MARKER_RULER_HEIGHT)
      ctx.lineTo(x1 - 0.5, BAR_RULER_HEIGHT)
      ctx.stroke()
    }
  }
  ctx.strokeStyle = tokens.line
  ctx.beginPath()
  ctx.moveTo(0, MARKER_RULER_HEIGHT + 0.5)
  ctx.lineTo(width, MARKER_RULER_HEIGHT + 0.5)
  ctx.moveTo(0, BAR_RULER_HEIGHT + 0.5)
  ctx.lineTo(width, BAR_RULER_HEIGHT + 0.5)
  ctx.stroke()
}
