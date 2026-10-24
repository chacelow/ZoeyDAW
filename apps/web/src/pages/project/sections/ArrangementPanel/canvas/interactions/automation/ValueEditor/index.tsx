import { DEVICE_PARAMETERS } from "@zoeydaw/project-core/devices"
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions } from "@/pages/project/adapters"
import {
  automationSourceValue,
  clampAutomationValue,
  normalizedAutomationValue,
} from "@zoeydaw/project-core/automation-curve"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { activeAutomationRows, automationX, automationY } from "../geometry"
import type { AutomationTarget } from "@zoeydaw/project-core/types"

export function AutomationValueEditor() {
  const scene = useSyncExternalStore(arrangementScene.subscribe, arrangementScene.get)
  const selection = scene.targetSelection
  if (selection.kind !== "automation-value") {
    return null
  }
  const row = activeAutomationRows(scene).find(
    item =>
      item.track.id === selection.trackId &&
      item.laneId === selection.laneId &&
      item.placement === selection.placement
  )
  const point = row?.lane?.points.find(item => item.id === selection.pointId)
  if (!row || !point) {
    return null
  }
  return (
    <ValueInput
      key={`${selection.trackId}:${selection.laneId}:${selection.placement}:${point.id}`}
      trackId={selection.trackId}
      laneId={selection.laneId}
      placement={selection.placement}
      pointId={point.id}
      pointIds={selection.pointIds}
      target={row.target}
      initial={point.value}
      x={automationX(scene, point.bar)}
      y={automationY(row, point.value)}
    />
  )
}

function formatValue(target: AutomationTarget, value: number): string {
  const source = automationSourceValue(target, value)
  if (target.kind === "device") {
    const unit = DEVICE_PARAMETERS[target.parameter].unit
    const suffix =
      unit === "hz"
        ? " Hz"
        : unit === "db"
          ? " dB"
          : unit === "ms"
            ? " ms"
            : unit === "seconds"
              ? " s"
              : unit === "percent" || unit === "ratioPercent"
                ? " %"
                : ""
    const displayed = unit === "ratioPercent" ? source * 100 : source
    return `${Number(displayed.toFixed(2))}${suffix}`
  }
  if (target.parameter === "volume") return source <= -60 ? "−∞ dB" : `${source.toFixed(1)} dB`
  return Math.abs(source) < 0.005
    ? "C"
    : `${source < 0 ? "L" : "R"} ${Math.round(Math.abs(source) * 100)}`
}

function ValueInput({
  trackId,
  laneId,
  placement,
  pointId,
  pointIds,
  target,
  initial,
  x,
  y,
}: {
  readonly trackId: string
  readonly laneId: string
  readonly placement: "primary" | "extra"
  readonly pointId: string
  readonly pointIds: readonly string[]
  readonly target: AutomationTarget
  readonly initial: number
  readonly x: number
  readonly y: number
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(formatValue(target, initial))
  const reference = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useLayoutEffect(() => {
    reference.current?.focus({ preventScroll: true })
    reference.current?.select()
  }, [pointId, trackId])
  function close(commit: boolean) {
    if (done.current) {
      return
    }
    done.current = true
    if (commit) {
      const trimmed = value.trim()
      const parsed =
        target.kind === "mixer" && target.parameter === "pan"
          ? /^c$/i.test(trimmed)
            ? 0
            : /^([lr])\s*(\d+(?:\.\d+)?)\s*%?$/i.test(trimmed)
              ? ((trimmed[0].toLowerCase() === "l" ? -1 : 1) *
                  Number(trimmed.match(/\d+(?:\.\d+)?/)?.[0])) /
                100
              : Number(trimmed)
          : target.kind === "mixer" && /^[-−]∞(?:\s*dB)?$/i.test(trimmed)
            ? -60
            : Number(trimmed.replace(/\s*(?:dB|Hz|ms|s|%)\s*$/i, ""))
      if (trimmed && Number.isFinite(parsed)) {
        const source =
          target.kind === "device" && DEVICE_PARAMETERS[target.parameter].unit === "ratioPercent"
            ? parsed / 100
            : parsed
        const normalized = normalizedAutomationValue(target, source)
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
            lane.points.map(item => {
              return pointIds.includes(item.id)
                ? { ...item, value: clampAutomationValue(item.value + delta) }
                : item
            })
          )
        }
      }
    }
    const selection = arrangementScene.get().targetSelection
    if (
      selection.kind === "automation-value" &&
      selection.pointId === pointId &&
      selection.trackId === trackId &&
      selection.laneId === laneId &&
      selection.placement === placement
    ) {
      arrangementScene.setTargetSelection({
        kind: "automation",
        trackId,
        laneId,
        placement,
        pointIds,
      })
    }
  }
  return (
    <input
      data-automation-value-editor=""
      ref={reference}
      value={value}
      aria-label={t("arrangement.editAutomationValue")}
      className="h-control-compact border-primary bg-background text-foreground absolute z-30 w-24 rounded border px-1 text-xs outline-none"
      style={{ left: Math.max(0, x + 8), top: Math.max(0, y - 10) }}
      onChange={event => setValue(event.target.value)}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        if (event.key === "Enter") {
          event.preventDefault()
          close(true)
        }
        if (event.key !== "Escape") {
          return
        }

        event.preventDefault()
        close(false)
      }}
      onBlur={() => close(true)}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}
    />
  )
}
