export type { CursorLockPort, WindowPoint } from "./cursor-port"
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

export type DragPadToggleProps = Omit<
  ButtonProps,
  "value" | "onChange" | "active" | "onActiveChange" | "icon" | "children"
> & {
  readonly value: boolean
  readonly onChange: (value: boolean) => void
  readonly label: string
  readonly description?: string
} & (
    | {
        readonly labelOn: string
        readonly labelOff: string
        readonly icon?: ButtonProps["icon"]
        readonly children?: ButtonProps["children"]
      }
    | {
        readonly icon: Exclude<ButtonProps["icon"], null | undefined | boolean>
        readonly children?: ButtonProps["children"]
        readonly labelOn?: never
        readonly labelOff?: never
      }
    | {
        readonly children: Exclude<ButtonProps["children"], null | undefined | boolean>
        readonly icon?: ButtonProps["icon"]
        readonly labelOn?: never
        readonly labelOff?: never
      }
  )

export function DragPadToggle({
  value,
  onChange,
  labelOn,
  labelOff,
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
