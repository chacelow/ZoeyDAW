import { consumeKey } from "@/shared/keyboard"
import { createContext, useContext, useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { navigateSelection } from "../RadioGroup/keyboard"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import { snapControlWidth } from "../grid"
import type { Props } from "@gpuix/react"
import type { SelectionEntry } from "../RadioGroup/keyboard"

type ToggleSelection =
  | { type: "single"; value: string; onValueChange: (value: string) => void }
  | { type: "multiple"; value: string[]; onValueChange: (value: string[]) => void }
export type ToggleGroupProps = Props &
  ToggleSelection & {
    disabled?: boolean
    orientation?: "horizontal" | "vertical"
    variant?: "default" | "outline" | "segmented"
  }
interface ToggleContextValue {
  selection: ToggleSelection
  disabled: boolean
  orientation: "horizontal" | "vertical"
  variant: "default" | "outline" | "segmented"
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
            position: "relative",
            flexDirection: orientation === "horizontal" ? "row" : "column",
            gap:
              variant === "segmented"
                ? theme.design.spacing.joinedGroupGap
                : theme.control["--spacing-control-track"],
            borderRadius: theme.design.shape.toggleRadius,
            overflow: "hidden",
          },
          style
        )}
      >
        {children}
        {variant === "segmented" ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              borderWidth: theme.design.shape.controlBorderWidth,
              borderColor: theme.colors.border,
              borderRadius: theme.design.shape.toggleRadius,
            }}
          />
        ) : null}
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
  const text =
    typeof children === "string" || typeof children === "number" ? String(children) : undefined
  const textStyle = {
    fontSize: style?.fontSize ?? theme.control["--text-control-track"],
    fontFamily: style?.fontFamily,
    fontWeight: style?.fontWeight,
    lineHeight: style?.lineHeight,
  }
  const measurement = useMeasuredTextWidth(text === undefined ? [] : [text], textStyle)
  const padding =
    (style?.paddingLeft ?? style?.padding ?? theme.control["--spacing-control-track-pad"]) +
    (style?.paddingRight ?? style?.padding ?? theme.control["--spacing-control-track-pad"])
  const border = group.variant === "segmented" ? 0 : theme.design.shape.controlBorderWidth
  const intrinsicWidth = snapControlWidth(
    measurement.width + padding + border * 2,
    theme.control["--spacing-control-track"]
  )
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
      width:
        text === undefined
          ? theme.design.grid.segmentWidthUnits * theme.control["--spacing-control-track"]
          : intrinsicWidth,
      fontSize: theme.control["--text-control-track"],
      minWidth: 0,
      flexShrink: 1,
      overflow: "hidden",
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
        segmented: { borderWidth: 0, borderRadius: 0, backgroundColor: theme.colors.secondary },
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
      {measurement.sampleNodes}
      {text === undefined ? (
        children
      ) : (
        <text
          style={{
            ...textStyle,
            minWidth: 0,
            flexShrink: 1,
            flexGrow: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {text}
        </text>
      )}
    </div>
  )
}
