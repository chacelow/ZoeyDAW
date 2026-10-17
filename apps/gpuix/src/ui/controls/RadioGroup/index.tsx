import { consumeKey } from "@/shared/keyboard"
import { createContext, useContext, useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { isActivationKey, navigateSelection } from "./keyboard"
import type { Props } from "@gpuix/react"
import type { SelectionEntry } from "./keyboard"

export interface RadioGroupProps extends Props {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  orientation?: "horizontal" | "vertical"
}
interface RadioContextValue {
  value: string
  select: (value: string) => void
  disabled: boolean
  orientation: "horizontal" | "vertical"
  entries: Map<string, SelectionEntry>
}
const RadioContext = createContext<RadioContextValue | null>(null)

export function RadioGroup({
  value,
  onValueChange,
  disabled = false,
  orientation = "vertical",
  children,
  style,
  ...props
}: RadioGroupProps) {
  const theme = useTheme()
  const entries = useRef(new Map<string, SelectionEntry>()).current
  return (
    <RadioContext.Provider value={{ value, select: onValueChange, disabled, orientation, entries }}>
      <div
        {...props}
        role="radiogroup"
        aria-disabled={disabled}
        style={sx(
          {
            display: "flex",
            flexDirection: orientation === "vertical" ? "column" : "row",
            gap: theme.control["--spacing-control-track-gap"],
          },
          style
        )}
      >
        {children}
      </div>
    </RadioContext.Provider>
  )
}

export interface RadioGroupItemProps extends Omit<Props, "ref"> {
  value: string
  disabled?: boolean
}
export function RadioGroupItem({
  value,
  disabled = false,
  children,
  style,
  onClick,
  onKeyDown,
  ...props
}: RadioGroupItemProps) {
  const group = useContext(RadioContext)
  if (!group) throw new Error("RadioGroupItem requires RadioGroup")
  const theme = useTheme()
  const { renderer } = useGpuix()
  const unavailable = disabled || group.disabled
  const selected = group.value === value
  const variants = sv({
    base: {
      display: "flex",
      flexDirection: "row",
      flexShrink: 0,
      alignItems: "center",
      gap: theme.control["--spacing-control-gap"],
      height: theme.control["--spacing-control-track"],
      fontSize: theme.control["--text-control-track"],
      color: theme.colors.foreground,
      cursor: theme.design.cursors.action,
      userSelect: "none",
      keyboardFocusDim: false,
      focusVisible: {
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: theme.colors.ring,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
    },
    variants: {
      disabled: {
        true: {
          opacity: theme.design.states.disabledOpacity,
          cursor: theme.design.cursors.disabled,
        },
        false: {},
      },
    },
  })
  return (
    <div
      {...props}
      role="radio"
      tabIndex={0}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      aria-checked={selected}
      aria-disabled={unavailable}
      ref={node => {
        if (node) group.entries.set(value, { value, disabled: unavailable, node })
        else group.entries.delete(value)
      }}
      style={sx(variants({ disabled: unavailable ? "true" : "false" }), style)}
      onClick={event => {
        if (!unavailable) {
          group.select(value)
          onClick?.(event)
        }
      }}
      onKeyDown={event => {
        if (unavailable) return
        if (isActivationKey(event)) {
          group.select(value)
          consumeKey(event, "handled")
        } else
          navigateSelection({
            event,
            value,
            entries: group.entries,
            renderer,
            orientation: group.orientation,
            select: group.select,
          })
        onKeyDown?.(event)
      }}
    >
      <div
        style={{
          display: "flex",
          pointerEvents: "none",
          flexShrink: 0,
          width: theme.control["--spacing-control-icon"],
          height: theme.control["--spacing-control-icon"],
          borderWidth: theme.design.shape.indicatorStrokeWidth,
          borderRadius: theme.control["--spacing-control-icon"],
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          <div
            style={{
              width: theme.control["--spacing-control-icon"] / 2,
              height: theme.control["--spacing-control-icon"] / 2,
              borderRadius: theme.control["--spacing-control-icon"],
              backgroundColor: theme.colors.primary,
            }}
          />
        ) : null}
      </div>
      {typeof children === "string" || typeof children === "number" ? (
        <text style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>{children}</text>
      ) : children}
    </div>
  )
}
