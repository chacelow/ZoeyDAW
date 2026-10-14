import { DragPadBipolar } from "../DragPad"
import type { DragPadBipolarProps } from "../DragPad"

export type PanControlProps = Omit<
  DragPadBipolarProps,
  "min" | "max" | "step" | "defaultValue" | "format" | "parse" | "label"
> & { readonly label?: string }

export function PanControl({ label = "Pan", ...props }: PanControlProps) {
  return (
    <DragPadBipolar
      {...props}
      label={label}
      min={-1}
      max={1}
      step={0.01}
      defaultValue={0}
      format={value =>
        value === 0 ? "C" : `${value < 0 ? "L" : "R"}${Math.round(Math.abs(value) * 100)}`
      }
      parse={raw => {
        const text = raw.trim().toUpperCase()
        if (text === "C") return 0
        if (text.startsWith("L")) return -Number(text.slice(1)) / 100
        return text.startsWith("R") ? Number(text.slice(1)) / 100 : Number(text)
      }}
      widthSamples={["L100", "R100", ...(props.widthSamples ?? [])]}
    />
  )
}
