export type { CursorLockPort, ScreenPoint } from "./cursor-port"
export { DragPadNumber } from "./DragPadNumber"
export type { DragPadNumberProps } from "./DragPadNumber"
export { formatNumericValue } from "./numberModel"
export { useDragPad } from "./useDragPad"
export type { UseDragPadOptions } from "./useDragPad"

import { NumericPad } from "./DragPadNumber"
import { Button } from "../Button"
import { useInfoBinding } from "../ControlEnvironment"
import type { DragPadNumberProps } from "./DragPadNumber"
import type { ButtonProps } from "../Button"

export type DragPadBarProps = DragPadNumberProps
export type DragPadBipolarProps = DragPadNumberProps

export function DragPadBar(props: DragPadBarProps) {
  return <NumericPad {...props} displayVariant="bar" />
}

export function DragPadBipolar(props: DragPadBipolarProps) {
  return <NumericPad {...props} displayVariant="bipolar" />
}

export interface DragPadToggleProps extends Omit<
  ButtonProps,
  "value" | "onChange" | "active" | "onActiveChange"
> {
  readonly value: boolean
  readonly onChange: (value: boolean) => void
  readonly label: string
  readonly labelOn?: string
  readonly labelOff?: string
  readonly description?: string
}

export function DragPadToggle({
  value,
  onChange,
  labelOn = "ON",
  labelOff = "OFF",
  icon,
  children,
  description,
  ...props
}: DragPadToggleProps) {
  const info = useInfoBinding({ type: "toggle", description })
  return (
    <Button
      {...props}
      {...info}
      active={value}
      onActiveChange={onChange}
      icon={icon}
      iconOnly={Boolean(icon)}
    >
      {children ?? (icon ? null : value ? labelOn : labelOff)}
    </Button>
  )
}
