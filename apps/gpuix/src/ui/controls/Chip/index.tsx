import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import { Icon } from "../Icon"
import { snapControlWidth } from "../grid"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import type { ButtonProps } from "../Button"

export interface ChipProps extends Omit<ButtonProps, "active" | "onActiveChange"> {
  readonly selected?: boolean
  readonly onSelectedChange?: (selected: boolean) => void
  readonly remove?: { readonly label: string; readonly onRemove: () => void }
}

export function Chip({
  selected = false,
  onSelectedChange,
  remove,
  children,
  style,
  disabled,
  size = "default",
  ...props
}: ChipProps) {
  const theme = useTheme()
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const height = theme.control["--spacing-control-track"]
  const text = typeof children === "string" || typeof children === "number" ? String(children) : ""
  const measurement = useMeasuredTextWidth([text], {
    fontSize: style?.fontSize ?? metrics["--text-control-track"],
    fontFamily: style?.fontFamily,
    fontWeight: style?.fontWeight,
  })
  const paddingRight = metrics["--spacing-control-track-pad"] +
    (remove ? metrics["--spacing-control-icon-slot"] + metrics["--spacing-control-gap"] : 0)
  const width = snapControlWidth(
    measurement.width + metrics["--spacing-control-track-pad"] + paddingRight +
      theme.design.shape.controlBorderWidth * 2 +
      (props.icon ? metrics["--spacing-control-icon-slot"] + metrics["--spacing-control-gap"] : 0),
    theme.control["--spacing-control-track"]
  )
  const contentWidth = measurement.width +
    (props.icon ? metrics["--spacing-control-icon-slot"] + metrics["--spacing-control-gap"] : 0) +
    (remove ? metrics["--spacing-control-icon-slot"] + metrics["--spacing-control-gap"] : 0)
  const shellWidth = typeof style?.width === "number" ? style.width : width
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "row", flexShrink: 0, width: style?.width ?? width }}>
      {measurement.sampleNodes}
      <Button
        {...props}
        disabled={disabled}
        size={size}
        active={selected}
        onActiveChange={onSelectedChange}
        style={sx(
          { width, height, borderRadius: theme.design.shape.controlRadius, paddingRight },
          style
        )}
      >
        {children}
      </Button>
      {remove ? (
        <Button
          disabled={disabled}
          size={size}
          label={remove.label}
          iconOnly
          variant="ghost"
          icon={<Icon name="X" />}
          onClick={remove.onRemove}
          style={{
            position: "absolute",
            top: theme.design.shape.controlBorderWidth,
            right: (shellWidth - contentWidth) / 2,
            width: metrics["--spacing-control-icon-slot"],
            height: height - theme.design.shape.controlBorderWidth * 2,
            borderWidth: 0,
            paddingLeft: 0,
            paddingRight: 0,
            color: selected ? theme.colors.primaryForeground : theme.colors.foreground,
          }}
        />
      ) : null}
    </div>
  )
}
