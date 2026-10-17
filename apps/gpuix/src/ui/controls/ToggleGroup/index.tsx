import { consumeKey } from "@/shared/keyboard"
import { createContext, useContext, useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { navigateSelection } from "../RadioGroup/keyboard"
import { Button } from "../Button"
import type { ButtonProps } from "../Button"
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
            alignItems: "start",
            gap: variant === "segmented"
              ? theme.design.spacing.joinedGroupGap
              : theme.control["--spacing-control-track-gap"],
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

export interface ToggleGroupItemProps extends Omit<ButtonProps, "ref" | "active" | "onActiveChange" | "variant"> {
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
  return (
    <Button
      {...props}
      disabled={unavailable}
      active={selected}
      onActiveChange={toggle}
      variant={group.variant === "outline" ? "outline" : "default"}
      aria-label={props["aria-label"] ?? (typeof children === "string" ? children : undefined)}
      ref={node => {
        if (node) group.entries.set(value, { value, disabled: unavailable, node })
        else group.entries.delete(value)
      }}
      style={sx(
        group.variant === "segmented" && {
          borderRadius: 0,
          borderColor: "transparent",
        },
        style
      )}
      onClick={onClick}
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
    </Button>
  )
}
