import { DragPadBar } from "@zoeymind/ui"
import { useAutomationGesture } from "@/pages/project/adapters"
import type { ReactNode } from "react"

const formatDb = (db: number) => (db <= -60 ? "−∞" : db.toFixed(1))

export function MixerLevel({
  label,
  value,
  onChange,
  disabled = false,
  icon,
  trackId,
}: {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly icon?: ReactNode
  readonly trackId?: string
}) {
  const gesture = useAutomationGesture(
    trackId ?? "",
    { kind: "mixer", parameter: "volume" },
    onChange,
    value
  )
  return (
    <DragPadBar
      size="compact"
      label={label}
      disabled={disabled}
      icon={icon}
      min={-60}
      max={6}
      step={0.1}
      defaultValue={0}
      format={formatDb}
      widthSamples={["−59.9", "6.0", "−∞"]}
      className="arrangement-volume-control w-full min-w-0"
      {...gesture}
    />
  )
}
