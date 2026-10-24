import { DragPadBar } from "@zoeymind/ui"
import { useProjectEditGesture } from "@/pages/project/adapters"
import type { ReactNode } from "react"

const formatDb = (db: number) => (db <= -60 ? "−∞" : db.toFixed(1))

export function MixerLevel({
  label,
  value,
  onChange,
  disabled = false,
  icon,
}: {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly icon?: ReactNode
}) {
  const gesture = useProjectEditGesture(onChange)
  return (
    <DragPadBar
      size="compact"
      label={label}
      value={value}
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
