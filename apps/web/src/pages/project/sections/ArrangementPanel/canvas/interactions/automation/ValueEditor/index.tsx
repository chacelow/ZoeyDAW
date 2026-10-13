import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import { automationSourceValue, clampAutomationValue } from "@/pages/project/model/automation-curve"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { activeAutomationRows, automationX, automationY } from "../geometry"

export function AutomationValueEditor() {
  const scene = useSyncExternalStore(arrangementScene.subscribe, arrangementScene.get)
  const selection = scene.targetSelection
  if (selection.kind !== "automation-value") return null
  const row = activeAutomationRows(scene).find(
    item => item.track.id === selection.trackId && item.laneId === selection.laneId
  )
  const point = row?.lane?.points.find(item => item.id === selection.pointId)
  if (!row || !point) return null
  return (
    <ValueInput
      key={`${selection.trackId}:${selection.laneId}:${point.id}`}
      trackId={selection.trackId}
      laneId={selection.laneId}
      pointId={point.id}
      pointIds={selection.pointIds}
      parameter={row.parameter}
      initial={point.value}
      x={automationX(scene, point.bar)}
      y={automationY(row, point.value)}
    />
  )
}

type Parameter = "volume" | "pan"
function formatValue(parameter: Parameter, value: number): string {
  const source = automationSourceValue(parameter, value)
  if (parameter === "volume") return source <= -60 ? "−∞ dB" : `${source.toFixed(1)} dB`
  return Math.abs(source) < 0.005
    ? "C"
    : `${source < 0 ? "L" : "R"} ${Math.round(Math.abs(source) * 100)}`
}

function ValueInput({
  trackId,
  laneId,
  pointId,
  pointIds,
  parameter,
  initial,
  x,
  y,
}: {
  trackId: string
  laneId: string
  pointId: string
  pointIds: readonly string[]
  parameter: Parameter
  initial: number
  x: number
  y: number
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(formatValue(parameter, initial))
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [pointId, trackId])
  function close(commit: boolean) {
    if (done.current) return
    done.current = true
    if (commit) {
      const trimmed = value.trim()
      const parsed =
        parameter === "pan"
          ? /^c$/i.test(trimmed)
            ? 0
            : /^([lr])\s*(\d+(?:\.\d+)?)\s*%?$/i.test(trimmed)
              ? ((trimmed[0].toLowerCase() === "l" ? -1 : 1) *
                  Number(trimmed.match(/\d+(?:\.\d+)?/)?.[0])) /
                100
              : Number(trimmed)
          : /^[-−]∞(?:\s*dB)?$/i.test(trimmed)
            ? -60
            : Number(trimmed.replace(/\s*dB\s*$/i, ""))
      if (trimmed && Number.isFinite(parsed)) {
        const normalized =
          parameter === "volume"
            ? clampAutomationValue((parsed + 60) / 66)
            : clampAutomationValue((parsed + 1) / 2)
        const lane = arrangementScene
          .get()
          .tracks.find(track => track.id === trackId)
          ?.automation.find(item => item.id === laneId)
        const point = lane?.points.find(item => item.id === pointId)
        if (lane && point && point.value !== normalized) {
          const delta = normalized - point.value
          projectActions.replaceAutomationPoints(
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
    const selection = arrangementScene.get().targetSelection
    if (
      selection.kind === "automation-value" &&
      selection.pointId === pointId &&
      selection.trackId === trackId
    )
      arrangementScene.setTargetSelection({ kind: "automation", trackId, laneId, pointIds })
  }
  return (
    <input
      data-automation-value-editor=""
      ref={ref}
      value={value}
      aria-label={t("arrangement.editAutomationValue")}
      className="absolute z-30 h-control-compact w-24 rounded border border-primary bg-background px-1 text-xs text-foreground outline-none"
      style={{ left: Math.max(0, x + 8), top: Math.max(0, y - 10) }}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === "Enter") {
          event.preventDefault()
          close(true)
        }
        if (event.key === "Escape") {
          event.preventDefault()
          close(false)
        }
      }}
      onBlur={() => close(true)}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    />
  )
}
