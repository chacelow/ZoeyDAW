import {
  TIME_RULER_HEIGHT,
  arrangementBodyBottom,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

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
  context.beginPath()
  context.moveTo(0, top + 0.5)
  context.lineTo(width, top + 0.5)
  context.stroke()
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
  for (let seconds = first; seconds <= last; seconds += timeStep) {
    const x = Math.round((seconds / secondsPerBar) * pxPerBar - scrollX)
    context.beginPath()
    context.moveTo(x + 0.5, top + 1)
    context.lineTo(x + 0.5, top + 5)
    context.strokeStyle = tokens.line
    context.stroke()
    const millis = Math.max(0, Math.round(seconds * 1000))
    const minutes = Math.floor(millis / 60_000)
    const rest = Math.floor((millis % 60_000) / 1000)
    const fractional = millis % 1000
    context.fillText(
      `${minutes}:${String(rest).padStart(2, "0")}${timeStep < 1 ? `.${String(fractional).padStart(3, "0")}` : ""}`,
      x + 3,
      top + TIME_RULER_HEIGHT / 2 + 1
    )
  }
}
