import {
  BAR_RULER_HEIGHT,
  LOOP_RULER_HEIGHT,
  PATTERN_RULER_HEIGHT,
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

/**
Pattern ruler: numbered musical positions. No divider between this band and the
loop band below it; the loop band draws its own top edge.
*/
export function paintPatternRuler(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  context.fillStyle = tokens.ruler
  context.fillRect(0, 0, width, PATTERN_RULER_HEIGHT)
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
  // Long tick at every labelled position, three short ticks in between.
  context.strokeStyle = tokens.line
  context.beginPath()
  for (let tick = firstTick; tick <= lastTick; tick++) {
    const x = Math.round(tick * tickWidth - scrollX)
    context.moveTo(x + 0.5, PATTERN_RULER_HEIGHT - 6)
    context.lineTo(x + 0.5, PATTERN_RULER_HEIGHT)
    for (let quarter = 1; quarter < 4; quarter++) {
      const minorX = Math.round((tick + quarter / 4) * tickWidth - scrollX)
      context.moveTo(minorX + 0.5, PATTERN_RULER_HEIGHT - 3)
      context.lineTo(minorX + 0.5, PATTERN_RULER_HEIGHT)
    }
  }
  context.stroke()
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
    context.fillText(label, x + 4, PATTERN_RULER_HEIGHT / 2)
  }
}

/**
Loop band: the brace body drags the whole region, either edge resizes it, and
both edges extend a guide line down to the bottom ruler with a small triangle.
*/
export function paintLoopRuler(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, pxPerBar, scrollX } = scene.viewport
  const top = PATTERN_RULER_HEIGHT
  const { loop } = scene
  const x0 = (loop.startBar - 1) * pxPerBar - scrollX
  const x1 = (loop.endBar - 1) * pxPerBar - scrollX
  const color = tokens.guide
  if (x1 >= 0 && x0 <= width) {
    context.fillStyle = color
    context.globalAlpha = loop.enabled ? 0.18 : 0.1
    context.fillRect(
      Math.max(0, x0),
      top,
      Math.max(0, Math.min(width, x1) - Math.max(0, x0)),
      LOOP_RULER_HEIGHT
    )
    context.globalAlpha = 1
    // The brace reads as one outlined band: a full frame plus an inward arrow at
    // each end, so both edges look like resizable handles.
    context.strokeStyle = color
    context.lineWidth = 1
    const inset = 2
    const frameTop = top + inset + 0.5
    const frameBottom = top + LOOP_RULER_HEIGHT - inset - 0.5
    context.beginPath()
    context.rect(x0 + 0.5, frameTop, x1 - x0 - 1, frameBottom - frameTop)
    context.stroke()
    const arrow = 4
    context.fillStyle = color
    for (const [x, direction] of [
      [x0 + inset + 1, 1],
      [x1 - inset - 1, -1],
    ] as const) {
      context.beginPath()
      context.moveTo(x, top + LOOP_RULER_HEIGHT / 2)
      context.lineTo(x + arrow * direction, top + LOOP_RULER_HEIGHT / 2 - arrow)
      context.lineTo(x + arrow * direction, top + LOOP_RULER_HEIGHT / 2 + arrow)
      context.closePath()
      context.fill()
    }
  }
  context.strokeStyle = tokens.line
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, top + 1)
  context.lineTo(width, top + 1)
  context.moveTo(0, BAR_RULER_HEIGHT + 1)
  context.lineTo(width, BAR_RULER_HEIGHT + 1)
  context.stroke()
  context.lineWidth = 1
}
