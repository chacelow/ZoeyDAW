import { useRef } from "react"
import { DropdownButton } from "@zoeymind/ui"
import type { PluginParameter } from "@/shared/native/plugins"

type Axis = "x" | "y"

interface Props {
  readonly parameters: readonly PluginParameter[]
  readonly xId: string | null
  readonly yId: string | null
  readonly onAxisChange: (axis: Axis, id: string | null) => void
  readonly onValueChange: (id: string, normalized: number) => void
  readonly label: string
  readonly noneLabel: string
  readonly xLabel: string
  readonly yLabel: string
}

export function ParameterXYPad({
  parameters,
  xId,
  yId,
  onAxisChange,
  onValueChange,
  label,
  noneLabel,
  xLabel,
  yLabel,
}: Props) {
  const pad = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const selected = (id: string | null) => parameters.find(parameter => parameter.id === id)
  const update = (clientX: number, clientY: number) => {
    const rect = pad.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    if (xId) onValueChange(xId, x)
    if (yId) onValueChange(yId, y)
  }
  const xValue = selected(xId)?.normalized ?? 0
  const yValue = selected(yId)?.normalized ?? 0
  const items = [
    { id: "none", label: noneLabel },
    ...parameters.map(parameter => ({ id: parameter.id, label: parameter.title })),
  ]
  return (
    <section className="gap-control-gap flex shrink-0 flex-col" aria-label={label}>
      <div
        ref={pad}
        role="application"
        aria-label={label}
        className="bg-background border-border relative h-28 min-h-28 touch-none overflow-hidden rounded-sm border"
        onPointerDown={event => {
          if (event.button !== 0) return
          active.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          update(event.clientX, event.clientY)
        }}
        onPointerMove={event => {
          if (active.current) update(event.clientX, event.clientY)
        }}
        onPointerUp={event => {
          active.current = false
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          active.current = false
        }}
      >
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:25%_100%,100%_25%] opacity-40" />
        <div
          className="bg-primary pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full shadow-sm"
          style={{ left: `${xValue * 100}%`, bottom: `${yValue * 100}%` }}
        />
      </div>
      <div className="gap-control-gap grid grid-cols-2">
        <DropdownButton
          size="compact"
          label={xLabel}
          value={xId ?? "none"}
          items={items}
          onChange={value => onAxisChange("x", value === "none" ? null : value)}
          matchTriggerWidth
        />
        <DropdownButton
          size="compact"
          label={yLabel}
          value={yId ?? "none"}
          items={items}
          onChange={value => onAxisChange("y", value === "none" ? null : value)}
          matchTriggerWidth
        />
      </div>
    </section>
  )
}
