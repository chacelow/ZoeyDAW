import { DragPadBipolar } from "../DragPad"
import type { DragPadBipolarProps } from "../DragPad"

export type PanControlProps = Omit<
  DragPadBipolarProps,
  "min" | "max" | "step" | "defaultValue" | "format" | "parse" | "widthSamples"
> &
  Required<Pick<DragPadBipolarProps, "format" | "parse" | "widthSamples">>

export function PanControl(props: PanControlProps) {
  return <DragPadBipolar {...props} min={-1} max={1} step={0.01} defaultValue={0} />
}
