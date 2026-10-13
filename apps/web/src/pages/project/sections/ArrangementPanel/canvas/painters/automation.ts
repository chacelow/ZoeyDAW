import type { ArrangementScene } from "../scene"
import {
  activeAutomationRows,
  AUTOMATION_POINT_RADIUS,
  automationRowValue,
  automationX,
  automationY,
  automationSegmentValue,
} from "../interactions/automation/geometry"

export interface AutomationTokens {
  stroke: string
  fill: string
}

export function paintAutomation(
  ctx: CanvasRenderingContext2D,
  scene: ArrangementScene,
  tokens: AutomationTokens
): void {
  const { viewport } = scene
  if (viewport.width <= 0 || viewport.height <= 0 || viewport.pxPerBar <= 0) return
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  ctx.save()
  ctx.strokeStyle = tokens.stroke
  ctx.fillStyle = tokens.fill
  ctx.lineWidth = 1.5

  for (const row of activeAutomationRows(scene)) {
    const points = row.lane?.points ?? []
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, row.top, viewport.width, row.bottom - row.top)
    ctx.clip()
    ctx.beginPath()
    const leftBar = 1 + viewport.scrollX / viewport.pxPerBar
    const leftValue = automationRowValue(row, leftBar)
    ctx.moveTo(0, automationY(row, leftValue))
    if (points.length && automationX(scene, points[0].bar) > 0)
      ctx.lineTo(automationX(scene, points[0].bar), automationY(row, points[0].value))
    else if (!points.length) ctx.lineTo(viewport.width, automationY(row, leftValue))
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]
      const to = points[i]
      const startX = automationX(scene, from.bar)
      const endX = automationX(scene, to.bar)
      if (endX < 0) continue
      if (startX > viewport.width) break
      const first = Math.max(0, Math.floor(Math.max(0, -startX) / 4))
      const last = Math.min(
        Math.ceil((endX - startX) / 4),
        Math.ceil((viewport.width - startX) / 4)
      )
      for (let step = first; step <= last; step++) {
        const x = Math.min(endX, Math.max(0, startX + step * 4))
        if (x <= viewport.width && (x > 0 || first === 0))
          ctx.lineTo(
            x,
            automationY(
              row,
              automationSegmentValue(
                from,
                to,
                from.bar + ((to.bar - from.bar) * (x - startX)) / (endX - startX)
              )
            )
          )
      }
      if (endX <= viewport.width) ctx.lineTo(endX, automationY(row, to.value))
      else {
        ctx.lineTo(
          viewport.width,
          automationY(
            row,
            automationSegmentValue(
              from,
              to,
              from.bar + ((to.bar - from.bar) * (viewport.width - startX)) / (endX - startX)
            )
          )
        )
        break
      }
    }
    if (points.length && automationX(scene, points[points.length - 1].bar) < viewport.width)
      ctx.lineTo(
        viewport.width,
        automationY(
          row,
          automationRowValue(row, 1 + (viewport.width + viewport.scrollX) / viewport.pxPerBar)
        )
      )
    ctx.stroke()
    for (const point of points) {
      const x = automationX(scene, point.bar)
      if (x < -6 || x > viewport.width + 6) continue
      const selected =
        scene.targetSelection.kind === "automation" &&
        scene.targetSelection.trackId === row.track.id &&
        scene.targetSelection.laneId === row.laneId &&
        scene.targetSelection.pointIds.includes(point.id)
      const editing =
        scene.targetSelection.kind === "automation-value" &&
        scene.targetSelection.pointId === point.id &&
        scene.targetSelection.trackId === row.track.id
      ctx.beginPath()
      ctx.arc(
        x,
        automationY(row, point.value),
        selected || editing ? AUTOMATION_POINT_RADIUS : 2.5,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}
