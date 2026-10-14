import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  MARKER_RULER_HEIGHT,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

/**
Transport's one-based beat notation omits the first beat of each bar.
*/
export function formatBarBeat(bar: number, beat: number): string {
  return beat === 1 ? String(bar) : `${bar}.${beat}`
}

export function numberedRulerPlan(pxPerBar: number, numerator: number) {
  const pxPerSixteenth = pxPerBar / (numerator * 4)
  if (pxPerSixteenth >= 38) {
    return { mode: "sixteenth" as const, stepBars: 1 / (numerator * 4) }
  }
  const pxPerBeat = pxPerBar / numerator
  if (pxPerBeat >= 56) {
    return { mode: "beat" as const, stepBars: 1 / numerator }
  }
  const stepBars = pxPerBar >= 56 ? 1 : 2 ** Math.ceil(Math.log2(56 / pxPerBar))
  return { mode: "bar" as const, stepBars }
}

export function paintLoopRuler(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  context.fillStyle = tokens.ruler
  context.fillRect(0, MARKER_RULER_HEIGHT, width, LOOP_RULER_HEIGHT)
  context.fillStyle = tokens.mutedForeground
  context.font = "10px ui-sans-serif, system-ui, sans-serif"
  context.textBaseline = "middle"
  const { numerator } = scene.transport
  const plan = numberedRulerPlan(pxPerBar, numerator)
  const isSixteenthLabels = plan.mode === "sixteenth"
  const isBeatLabels = plan.mode === "beat"
  const step = plan.stepBars
  const tickWidth = pxPerBar * step
  const firstTick = Math.max(0, Math.ceil(scrollX / tickWidth))
  const lastTick = Math.min(
    isSixteenthLabels
      ? scene.bars * numerator * 4
      : isBeatLabels
        ? scene.bars * numerator
        : Math.floor(scene.bars / step),
    Math.floor((scrollX + width) / tickWidth)
  )
  for (let tick = firstTick; tick <= lastTick; tick++) {
    const x = Math.round(tick * tickWidth - scrollX)
    const bar =
      (isSixteenthLabels
        ? Math.floor(tick / (numerator * 4))
        : isBeatLabels
          ? Math.floor(tick / numerator)
          : tick * step) + 1
    const beat = isSixteenthLabels
      ? Math.floor((tick % (numerator * 4)) / 4) + 1
      : isBeatLabels
        ? (tick % numerator) + 1
        : 1
    const subdivision = isSixteenthLabels ? (tick % 4) + 1 : 1
    const label = subdivision === 1 ? formatBarBeat(bar, beat) : `${bar}.${beat}.${subdivision}`
    context.fillText(label, x + 4, MARKER_RULER_HEIGHT + LOOP_RULER_HEIGHT / 2)
  }
  const { loop } = scene
  if (loop.enabled) {
    const x0 = (loop.startBar - 1) * pxPerBar - scrollX
    const x1 = (loop.endBar - 1) * pxPerBar - scrollX
    if (x1 >= 0 && x0 <= width) {
      context.fillStyle = tokens.primary
      context.globalAlpha = 0.18
      context.fillRect(
        Math.max(0, x0),
        MARKER_RULER_HEIGHT,
        Math.max(0, Math.min(width, x1) - Math.max(0, x0)),
        LOOP_RULER_HEIGHT
      )
      context.globalAlpha = 1
      context.strokeStyle = tokens.primary
      context.beginPath()
      context.moveTo(x0 + 0.5, MARKER_RULER_HEIGHT)
      context.lineTo(x0 + 0.5, BAR_RULER_HEIGHT)
      context.moveTo(x1 - 0.5, MARKER_RULER_HEIGHT)
      context.lineTo(x1 - 0.5, BAR_RULER_HEIGHT)
      context.stroke()
    }
  }
  context.strokeStyle = tokens.line
  context.beginPath()
  context.moveTo(0, MARKER_RULER_HEIGHT + 0.5)
  context.lineTo(width, MARKER_RULER_HEIGHT + 0.5)
  context.moveTo(0, BAR_RULER_HEIGHT + 0.5)
  context.lineTo(width, BAR_RULER_HEIGHT + 0.5)
  context.stroke()
}
