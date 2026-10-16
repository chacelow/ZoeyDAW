import { consumeKey } from "@/shared/keyboard"
import { createContext, useContext, useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { navigateSelection } from "../RadioGroup/keyboard"
import type { Props } from "@gpuix/react"
import type { SelectionEntry } from "../RadioGroup/keyboard"

type ToggleSelection =
  | { type: "single"; value: string; onValueChange: (value: string) => void }
  | { type: "multiple"; value: string[]; onValueChange: (value: string[]) => void }
export type ToggleGroupProps = Props &
  ToggleSelection & {
    disabled?: boolean
    orientation?: "horizontal" | "vertical"
    variant?: "default" | "outline"
  }
interface ToggleContextValue {
  selection: ToggleSelection
  disabled: boolean
  orientation: "horizontal" | "vertical"
  variant: "default" | "outline"
  entries: Map<string, SelectionEntry>
}
const ToggleContext = createContext<ToggleContextValue | null>(null)

export function ToggleGroup(props: ToggleGroupProps) {
  const {
    children,
    style,
    disabled = false,
    orientation = "horizontal",
    variant = "default",
    type: _type,
    value: _value,
    onValueChange: _onValueChange,
    ...native
  } = props
  const theme = useTheme()
  const entries = useRef(new Map<string, SelectionEntry>()).current
  const selection: ToggleSelection = props
  return (
    <ToggleContext.Provider value={{ selection, disabled, orientation, variant, entries }}>
      <div
        {...native}
        role="group"
        aria-disabled={disabled}
        style={sx(
          {
            display: "flex",
            flexDirection: orientation === "horizontal" ? "row" : "column",
            gap: theme.control["--spacing-control-gap"],
          },
          style
        )}
      >
        {children}
      </div>
    </ToggleContext.Provider>
  )
}

export interface ToggleGroupItemProps extends Omit<Props, "ref"> {
  value: string
  disabled?: boolean
}
export function ToggleGroupItem({
  value,
  disabled = false,
  children,
  style,
  onClick,
  onKeyDown,
  ...props
}: ToggleGroupItemProps) {
  const group = useContext(ToggleContext)
  if (!group) throw new Error("ToggleGroupItem requires ToggleGroup")
  const theme = useTheme()
  const { renderer } = useGpuix()
  const unavailable = disabled || group.disabled
  const selected =
    group.selection.type === "single"
      ? group.selection.value === value
      : group.selection.value.includes(value)
  const toggle = () => {
    if (unavailable) return
    const selection = group.selection
    if (selection.type === "single") selection.onValueChange(selected ? "" : value)
    else
      selection.onValueChange(
        selected ? selection.value.filter(item => item !== value) : [...selection.value, value]
      )
  }
  const variants = sv({
    base: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.control["--spacing-control-gap"],
      height: theme.control["--spacing-control-track"],
      fontSize: theme.control["--text-control-track"],
      color: theme.colors.foreground,
      borderWidth: theme.design.shape.controlBorderWidth,
      borderRadius: theme.design.shape.toggleRadius,
      paddingLeft: theme.control["--spacing-control-track-pad"],
      paddingRight: theme.control["--spacing-control-track-pad"],
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
      variant: {
        default: { borderColor: theme.colors.background },
        outline: { borderColor: theme.colors.border },
      },
      selected: {
        true: {
          backgroundColor: theme.colors.accent,
          color: theme.colors.accentForeground,
          borderColor: theme.colors.ring,
          active: { backgroundColor: theme.colors.accent },
        },
        false: {
          hover: { backgroundColor: theme.colors.muted },
          active: { backgroundColor: theme.colors.accent },
        },
      },
      disabled: {
        true: {
          opacity: theme.design.states.disabledOpacity,
          cursor: theme.design.cursors.disabled,
          hover: { backgroundColor: selected ? theme.colors.accent : "transparent" },
          active: { backgroundColor: selected ? theme.colors.accent : "transparent" },
        },
        false: {},
      },
    },
  })
  return (
    <div
      {...props}
      role="button"
      tabIndex={0}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      aria-disabled={unavailable}
      aria-pressed={selected}
      ref={node => {
        if (node) group.entries.set(value, { value, disabled: unavailable, node })
        else group.entries.delete(value)
      }}
      style={sx(
        variants({
          variant: group.variant,
          selected: selected ? "true" : "false",
          disabled: unavailable ? "true" : "false",
        }),
        style
      )}
      onClick={event => {
        if (!unavailable) {
          toggle()
          onClick?.(event)
        }
      }}
      onKeyDown={event => {
        if (unavailable) return
        if (event.key === "enter") {
          toggle()
          consumeKey(event, "handled")
        } else
          navigateSelection({
            event,
            value,
            entries: group.entries,
            renderer,
            orientation: group.orientation,
          })
        onKeyDown?.(event)
      }}
    >
      {children}
    </div>
  )
}
