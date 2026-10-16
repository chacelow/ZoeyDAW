import { useMemo } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Shape } from "@/shared/svg/Shape"
import { polylinePath } from "@/shared/svg/paths"
import type { Point } from "@/shared/svg/paths"
import {
  activeAutomationRows,
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
  const pointRadius = scene.geometry.arrangement.automationPointRadius
  const step = theme.control["--spacing-control-track-gap"]
  const rows = useMemo(
    () => activeAutomationRows(scene).filter(row => row.track.id === trackId),
    [scene, trackId]
  )
  if (width <= 0) return null
  return (
    <>
      {rows.map(row => {
        const points = row.lane?.points ?? []
        const startY = automationY(row, automationRowValue(row, automationBar(scene, 0))) - row.top
        const samples: Point[] = [{ x: 0, y: startY }]
        if (!points.length) samples.push({ x: width, y: startY })
        else if (points[0] && automationX(scene, points[0].bar) > 0)
          samples.push({
            x: Math.min(width, automationX(scene, points[0].bar)),
            y: automationY(row, points[0].value) - row.top,
          })
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
            samples.push({
              x,
              y:
                automationY(row, automationSegmentValue(from, to, automationBar(scene, x))) -
                row.top,
            })
          samples.push({
            x: last,
            y:
              automationY(row, automationSegmentValue(from, to, automationBar(scene, last))) -
              row.top,
          })
        }
        const last = points.at(-1)
        if (last && automationX(scene, last.bar) < width)
          samples.push({ x: width, y: automationY(row, last.value) - row.top })
        const d = polylinePath(samples)
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
            <Shape
              width={width}
              height={row.bottom - row.top}
              paths={[{ d, strokeWidth: theme.control["--spacing-control-track-pad"] }]}
              color={theme.colors.arrangementAutomation}
              style={sx({ position: "absolute", left: 0, top: 0, pointerEvents: "none" })}
            />
            {points
              .filter(
                point =>
                  automationX(scene, point.bar) + pointRadius > 0 &&
                  automationX(scene, point.bar) - pointRadius < width
              )
              .map(point => {
                const selection = scene.targetSelection
                const selected =
                  (selection.kind === "automation" || selection.kind === "automation-value") &&
                  selection.trackId === row.track.id &&
                  selection.laneId === row.laneId &&
                  selection.pointIds.includes(point.id)
                const radius = selected ? pointRadius : theme.control["--spacing-control-gap"]
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
                      backgroundColor: theme.colors.arrangementAutomation,
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
