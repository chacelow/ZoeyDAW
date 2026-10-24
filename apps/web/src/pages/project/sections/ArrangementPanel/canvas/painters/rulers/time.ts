import {
  TIME_RULER_HEIGHT,
  arrangementBodyBottom,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"
import { formatRulerTime } from "./format"

export function paintTimeRuler(
  context: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, height, pxPerBar, scrollX } = scene.viewport
  const top = arrangementBodyBottom(height)
  context.fillStyle = tokens.ruler
  context.fillRect(0, top, width, TIME_RULER_HEIGHT)
  context.strokeStyle = tokens.line
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, top + 1)
  context.lineTo(width, top + 1)
  context.stroke()
  context.lineWidth = 1
  const { bpm, numerator, denominator } = scene.transport
  const secondsPerBar = (60 / bpm) * numerator * (4 / denominator)
  if (!(secondsPerBar > 0) || !Number.isFinite(secondsPerBar)) {
    return
  }
  const pixelsPerSecond = pxPerBar / secondsPerBar
  const needed = 64 / pixelsPerSecond
  const power = 10 ** Math.floor(Math.log10(needed))
  const timeStep =
    [1, 2, 5, 10].map(value => value * power).find(value => value >= needed) ?? needed
  const first = Math.ceil(((scrollX / pxPerBar) * secondsPerBar) / timeStep) * timeStep
  const last = ((scrollX + width) / pxPerBar) * secondsPerBar
  context.fillStyle = tokens.mutedForeground
  context.font = "10px ui-sans-serif, system-ui, sans-serif"
  context.textBaseline = "middle"
  // Minor quarter ticks between labelled positions, then the labelled ticks.
  context.beginPath()
  context.strokeStyle = tokens.rulerLine
  for (let seconds = first; seconds <= last; seconds += timeStep) {
    for (let quarter = 1; quarter < 4; quarter++) {
      const minor = seconds + (timeStep * quarter) / 4
      if (minor > last) {
        continue
      }
      const x = Math.round((minor / secondsPerBar) * pxPerBar - scrollX)
      context.moveTo(x + 0.5, top + 1)
      context.lineTo(x + 0.5, top + 3)
    }
  }
  context.stroke()
  for (let seconds = first; seconds <= last; seconds += timeStep) {
    const x = Math.round((seconds / secondsPerBar) * pxPerBar - scrollX)
    context.beginPath()
    context.moveTo(x + 0.5, top + 1)
    context.lineTo(x + 0.5, top + 7)
    context.strokeStyle = tokens.rulerLine
    context.stroke()
    context.fillText(
      formatRulerTime(seconds, scene.rulerFormat ?? "time", timeStep < 1),
      x + 3,
      top + TIME_RULER_HEIGHT / 2 + 1
    )
  }
}
