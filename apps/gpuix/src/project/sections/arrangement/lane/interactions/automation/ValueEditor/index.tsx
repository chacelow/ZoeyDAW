import { useRef, useState } from "react"
import { Input } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import {
  automationSourceValue,
  clampAutomationValue,
  normalizedAutomationValue,
} from "@/project/model/automation-curve"
import {
  activeAutomationRows,
  automationX,
  automationY,
} from "@/project/sections/arrangement/core/automation/geometry"
import type { LaneTranslate } from "@/project/sections/arrangement/lane/messages"
import type { LaneContext } from "../../types"
import type { ArrangementScene } from "@/project/sections/arrangement/core/scene"

export function AutomationValueEditor({
  context,
  scene,
  trackId,
  originY,
  t,
}: {
  context: LaneContext
  scene: ArrangementScene
  trackId: string
  originY: number
  t: LaneTranslate
}) {
  const selection = scene.targetSelection
  if (selection.kind !== "automation-value" || selection.trackId !== trackId) return null
  const row = activeAutomationRows(scene).find(
    item => item.track.id === selection.trackId && item.laneId === selection.laneId
  )
  const point = row?.lane?.points.find(item => item.id === selection.pointId)
  if (!row || !point) return null
  return (
    <ValueInput
      key={`${selection.trackId}:${selection.laneId}:${point.id}`}
      context={context}
      t={t}
      trackId={selection.trackId}
      laneId={selection.laneId}
      pointId={point.id}
      pointIds={selection.pointIds}
      parameter={row.parameter}
      initial={point.value}
      x={automationX(scene, point.bar)}
      y={automationY(row, point.value) - originY}
    />
  )
}

function ValueInput({
  context,
  t,
  trackId,
  laneId,
  pointId,
  pointIds,
  parameter,
  initial,
  x,
  y,
}: {
  context: LaneContext
  t: LaneTranslate
  trackId: string
  laneId: string
  pointId: string
  pointIds: readonly string[]
  parameter: "volume" | "pan"
  initial: number
  x: number
  y: number
}) {
  const theme = useTheme()
  const [value, setValue] = useState(() => {
    const source = automationSourceValue(parameter, initial)
    return parameter === "volume"
      ? source <= -60
        ? "−∞ dB"
        : `${source.toFixed(1)} dB`
      : Math.abs(source) < 0.005
        ? "C"
        : `${source < 0 ? "L" : "R"} ${Math.round(Math.abs(source) * 100)}`
  })
  const done = useRef(false)
  const epoch = useRef(context.getState().session.editEpoch)
  function finish(commit: boolean) {
    if (done.current) return
    done.current = true
    if (context.getState().session.editEpoch !== epoch.current) return
    const selection = context.scene.get().targetSelection
    if (
      selection.kind !== "automation-value" ||
      selection.pointId !== pointId ||
      selection.trackId !== trackId ||
      selection.laneId !== laneId
    )
      return
    if (commit) {
      const trimmed = value.trim()
      const parsed =
        parameter === "pan"
          ? /^c$/i.test(trimmed)
            ? 0
            : /^([lr])\s*(\d+(?:\.\d+)?)\s*%?$/i.test(trimmed)
              ? ((trimmed[0]?.toLowerCase() === "l" ? -1 : 1) *
                  Number(trimmed.match(/\d+(?:\.\d+)?/)?.[0])) /
                100
              : Number(trimmed)
          : /^[-−]∞(?:\s*dB)?$/i.test(trimmed)
            ? -60
            : Number(trimmed.replace(/\s*dB\s*$/i, ""))
      if (trimmed && Number.isFinite(parsed)) {
        const normalized = normalizedAutomationValue(parameter, parsed)
        const lane = context
          .getState()
          .document.tracks.find(track => track.id === trackId)
          ?.automation.find(item => item.id === laneId)
        const point = lane?.points.find(item => item.id === pointId)
        if (lane && point && point.value !== normalized) {
          const delta = normalized - point.value
          context.actions.replaceAutomationPoints(
            trackId,
            laneId,
            lane.points.map(item =>
              pointIds.includes(item.id)
                ? { ...item, value: clampAutomationValue(item.value + delta) }
                : item
            )
          )
        }
      }
    }
    context.scene.setTargetSelection({ kind: "automation", trackId, laneId, pointIds })
  }
  return (
    <Input
      autoFocus
      selectAllOnFocus
      testId="automation-value-editor"
      aria-label={t("arrangement.editAutomationValue")}
      value={value}
      onValueChange={setValue}
      style={sx({
        position: "absolute",
        left: Math.max(
          0,
          Math.min(
            context.scene.get().viewport.width - theme.project.identityWidth,
            x + theme.design.spacing.stackGap
          )
        ),
        top: Math.max(0, y - theme.control["--spacing-control-icon"]),
        width: theme.project.identityWidth,
        borderRadius: theme.design.editor.inlineRadius,
        borderColor: theme.colors.primary,
        paddingLeft: theme.control["--spacing-control-gap"],
        paddingRight: theme.control["--spacing-control-gap"],
      })}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "escape") {
          event.preventDefault()
          finish(false)
        }
      }}
      onSubmit={() => finish(true)}
      onBlur={() => finish(true)}
      onMouseDownOutside={() => finish(true)}
    />
  )
}
