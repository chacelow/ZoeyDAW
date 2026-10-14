import { DragPadBipolar } from "../DragPad"

export interface PanControlProps {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean
  readonly className?: string
  readonly size?: "default" | "compact"
  readonly label?: string
  readonly onGestureStart?: () => void
  readonly onGestureEnd?: () => void
  readonly onGestureCancel?: () => void
}

export function PanControl({
  value,
  onChange,
  disabled,
  className,
  size,
  label = "Pan",
  onGestureStart,
  onGestureEnd,
  onGestureCancel,
}: PanControlProps) {
  return (
    <DragPadBipolar
      value={value}
      onChange={onChange}
      min={-1}
      max={1}
      step={0.01}
      defaultValue={0}
      format={v => (v === 0 ? "C" : `${v < 0 ? "L" : "R"}${Math.round(Math.abs(v) * 100)}`)}
      parse={raw => {
        const text = raw.trim().toUpperCase()
        if (text === "C") {
          return 0
        }
        if (text.startsWith("L")) {
          return -Number(text.slice(1)) / 100
        }
        return text.startsWith("R") ? Number(text.slice(1)) / 100 : Number(text)
      }}
      widthSamples={["L100", "R100"]}
      onGestureStart={onGestureStart}
      onGestureEnd={onGestureEnd}
      onGestureCancel={onGestureCancel}
      label={label}
      disabled={disabled}
      className={className}
      size={size}
    />
  )
}
