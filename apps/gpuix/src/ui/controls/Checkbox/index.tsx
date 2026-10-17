import { consumeKey } from "@/shared/keyboard"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import { Icon } from "../Icon"
import type { ButtonProps } from "../Button"

export interface CheckboxProps extends Omit<
  ButtonProps,
  "active" | "onActiveChange" | "icon" | "onChange"
> {
  readonly checked: boolean | "mixed"
  readonly onCheckedChange: (checked: boolean) => void
  readonly invalid?: boolean
}

export function Checkbox({
  checked,
  onCheckedChange,
  invalid = false,
  disabled = false,
  style,
  onKeyDown,
  ...props
}: CheckboxProps) {
  const theme = useTheme()
  return (
    <Button
      {...props}
      variant={props.variant ?? "outline"}
      iconOnly={props.children === undefined}
      role="checkbox"
      disabled={disabled}
      active={checked !== false}
      aria-checked={checked}
      aria-invalid={invalid}
      onClick={() => onCheckedChange(checked !== true)}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (!event.defaultPrevented && !disabled && event.key === "space") {
          onCheckedChange(checked !== true)
          consumeKey(event, "handled")
        }
      }}
      icon={
        <Icon
          name={checked === "mixed" ? "Minus" : "Check"}
          color={checked === false ? "transparent" : theme.colors.primaryForeground}
        />
      }
      style={sx(invalid && { borderColor: theme.colors.destructive }, style)}
    />
  )
}
