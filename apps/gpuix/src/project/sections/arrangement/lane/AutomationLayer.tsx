import { useMemo } from "react"
import { useTheme } from "../../../../shared/theme/ThemeProvider"
import { sx } from "../../../../shared/theme/style"
import {
  activeAutomationRows,
  AUTOMATION_POINT_RADIUS,
  automationBar,
  automationRowValue,
  automationSegmentValue,
  automationX,
  automationY,
} from "../core/automation/geometry"
import type { ArrangementScene } from "../core/scene"

export function AutomationLayer({ scene, trackId }: { scene: ArrangementScene; trackId: string }) {
  const theme = useTheme()
  const width = scene.viewport.width
  const step = theme.control["--spacing-control-track-gap"]
  const rows = useMemo(
    () => activeAutomationRows(scene).filter(row => row.track.id === trackId),
    [scene, trackId]
  )
  return (
    <>
      {rows.map(row => {
        const points = row.lane?.points ?? []
        const startY = automationY(row, automationRowValue(row, automationBar(scene, 0))) - row.top
        const path = [`M0,${startY}`]
        if (!points.length) path.push(`L${width},${startY}`)
        else if (points[0] && automationX(scene, points[0].bar) > 0)
          path.push(
            `L${Math.min(width, automationX(scene, points[0].bar))},${automationY(row, points[0].value) - row.top}`
          )
        for (let index = 1; index < points.length; index++) {
          const from = points[index - 1]
          const to = points[index]
          if (!from || !to) continue
          const x0 = automationX(scene, from.bar)
          const x1 = automationX(scene, to.bar)
          if (x1 < 0) continue
          if (x0 > width) break
          const first = Math.max(0, x0)
          const last = Math.min(width, x1)
          for (let x = first; x < last; x += step)
            path.push(
              `L${x},${automationY(row, automationSegmentValue(from, to, automationBar(scene, x))) - row.top}`
            )
          path.push(
            `L${last},${automationY(row, automationSegmentValue(from, to, automationBar(scene, last))) - row.top}`
          )
        }
        const last = points.at(-1)
        if (last && automationX(scene, last.bar) < width)
          path.push(`L${width},${automationY(row, last.value) - row.top}`)
        const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${row.bottom - row.top}"><path d="${path.join(" ")}" fill="none" stroke="black" stroke-width="${theme.control["--spacing-control-track-pad"]}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        return (
          <div
            key={`${row.track.id}:${row.laneId}`}
            testId={`automation-${row.track.id}-${row.laneId}`}
            style={sx({
              position: "absolute",
              left: 0,
              top: row.top,
              width,
              height: row.bottom - row.top,
              overflow: "hidden",
              pointerEvents: "none",
            })}
          >
            <svg
              source={source}
              aria-hidden
              style={sx({
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height: row.bottom - row.top,
                color: theme.colors.destructive,
                pointerEvents: "none",
              })}
            />
            {points
              .filter(
                point =>
                  automationX(scene, point.bar) + AUTOMATION_POINT_RADIUS > 0 &&
                  automationX(scene, point.bar) - AUTOMATION_POINT_RADIUS < width
              )
              .map(point => {
                const selection = scene.targetSelection
                const selected =
                  (selection.kind === "automation" || selection.kind === "automation-value") &&
                  selection.trackId === row.track.id &&
                  selection.laneId === row.laneId &&
                  selection.pointIds.includes(point.id)
                const radius = selected
                  ? AUTOMATION_POINT_RADIUS
                  : theme.control["--spacing-control-gap"]
                return (
                  <div
                    key={point.id}
                    testId={`automation-point-${point.id}`}
                    style={sx({
                      position: "absolute",
                      left: automationX(scene, point.bar) - radius,
                      top: automationY(row, point.value) - row.top - radius,
                      width: radius * 2,
                      height: radius * 2,
                      borderRadius: radius,
                      backgroundColor: theme.colors.destructive,
                      pointerEvents: "none",
                    })}
                  />
                )
              })}
          </div>
        )
      })}
    </>
  )
}
