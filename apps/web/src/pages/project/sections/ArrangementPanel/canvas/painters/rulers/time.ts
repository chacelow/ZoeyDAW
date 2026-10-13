import {
  TIME_RULER_HEIGHT,
  arrangementBodyBottom,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import type { ArrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { GridTokens } from "../grid"

export function paintTimeRuler(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: GridTokens
): void {
  const { width, height, pxPerBar, scrollX } = scene.viewport
  const top = arrangementBodyBottom(height)
  ctx.fillStyle = tokens.ruler
  ctx.fillRect(0, top, width, TIME_RULER_HEIGHT)
  ctx.strokeStyle = tokens.line
  ctx.beginPath()
  ctx.moveTo(0, top + 0.5)
  ctx.lineTo(width, top + 0.5)
  ctx.stroke()
  const { bpm, numerator, denominator } = scene.transport
  const secondsPerBar = (60 / bpm) * numerator * (4 / denominator)
  if (!(secondsPerBar > 0) || !Number.isFinite(secondsPerBar)) return
  const pixelsPerSecond = pxPerBar / secondsPerBar
  const needed = 64 / pixelsPerSecond
  const power = 10 ** Math.floor(Math.log10(needed))
  const timeStep =
    [1, 2, 5, 10].map(value => value * power).find(value => value >= needed) ?? needed
  const first = Math.ceil(((scrollX / pxPerBar) * secondsPerBar) / timeStep) * timeStep
  const last = ((scrollX + width) / pxPerBar) * secondsPerBar
  ctx.fillStyle = tokens.mutedForeground
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
  ctx.textBaseline = "middle"
  for (let seconds = first; seconds <= last; seconds += timeStep) {
    const x = Math.round((seconds / secondsPerBar) * pxPerBar - scrollX)
    ctx.beginPath()
    ctx.moveTo(x + 0.5, top + 1)
    ctx.lineTo(x + 0.5, top + 5)
    ctx.strokeStyle = tokens.line
    ctx.stroke()
    const millis = Math.max(0, Math.round(seconds * 1000))
    const minutes = Math.floor(millis / 60000)
    const rest = Math.floor((millis % 60000) / 1000)
    const fractional = millis % 1000
    ctx.fillText(
      `${minutes}:${String(rest).padStart(2, "0")}${timeStep < 1 ? `.${String(fractional).padStart(3, "0")}` : ""}`,
      x + 3,
      top + TIME_RULER_HEIGHT / 2 + 1
    )
  }
}
