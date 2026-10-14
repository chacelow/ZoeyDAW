import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@gpuix/react"
import { useTheme } from "../../../shared/theme/ThemeProvider"
import { sx } from "../../../shared/theme/style"
import { controlChrome } from "../chrome"
import { useInfoBinding } from "../ControlEnvironment"
import { useMeasuredTextWidth } from "../useMeasuredTextWidth"
import { IconSlot } from "../IconSlot"
import type { Props, StyleDesc } from "@gpuix/react"
import type { FloatingAlign, FloatingSide } from "@gpuix/react/floating"
import type { ReactNode } from "react"
import type { ControlSize } from "../chrome"

export interface DropdownButtonValueItem<T extends string = string> {
  readonly id: T
  readonly label: ReactNode
  readonly disabled?: boolean
  readonly onSelect?: () => void
  readonly shortcut?: string
}
export type DropdownButtonItem<T extends string = string> =
  | DropdownButtonValueItem<T>
  | { readonly type: "heading"; readonly id: string; readonly label: ReactNode }
  | { readonly type: "separator"; readonly id: string }
export interface DropdownButtonProps<T extends string = string> {
  readonly value: T
  readonly onChange: (value: T) => void
  readonly items: readonly DropdownButtonItem<T>[]
  readonly label: string
  readonly description?: string
  readonly disabled?: boolean
  readonly renderValue?: (item: DropdownButtonValueItem<T> | undefined) => ReactNode
  readonly size?: ControlSize
  readonly icon?: ReactNode
  readonly side?: FloatingSide
  readonly align?: FloatingAlign
  readonly sideOffset?: number
  readonly matchTriggerWidth?: boolean
  readonly fill?: boolean
  readonly style?: Props["style"]
  readonly testId?: string
}

export function DropdownButton<T extends string = string>({
  value,
  onChange,
  items,
  label,
  description,
  disabled = false,
  renderValue,
  size = "default",
  icon,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  matchTriggerWidth = true,
  fill = false,
  style,
  testId,
}: DropdownButtonProps<T>) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const metrics = size === "transport" ? theme.transportControl : theme.control
  const info = useInfoBinding({ type: "dropdown", description })
  const choices = items.filter((item): item is DropdownButtonValueItem<T> => !("type" in item))
  const selected = choices.find(item => item.id === value)
  const measured = useMeasuredTextWidth(
    choices.map(item =>
      typeof item.label === "string" ? item.label.replace(/\r?\n/g, " ") : item.id
    ),
    { fontSize: metrics["--text-control-track"] }
  )
  const width =
    measured.width +
    metrics["--spacing-control-track-pad"] * 2 +
    metrics["--spacing-control-icon"] +
    metrics["--spacing-control-gap"] * 2 +
    (icon ? metrics["--spacing-control-icon-slot"] : 0) +
    2
  const display = renderValue ? renderValue(selected) : (selected?.label ?? value)
  const contentStyle: StyleDesc = {
    minWidth: matchTriggerWidth ? width : 120,
    maxWidth: 320,
    maxHeight: 300,
    overflowY: "scroll",
    padding: metrics["--spacing-control-track-gap"],
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    backgroundColor: theme.colors.popover,
  }
  return (
    <Select
      testId={testId ? `${testId}-root` : undefined}
      value={value}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
      style={{ width: fill ? "100%" : width, flexShrink: fill ? 1 : 0 }}
      onValueChange={next => {
        const item = choices.find(choice => choice.id === next)
        if (item && !item.disabled) {
          item.onSelect?.()
          onChange(item.id)
        }
      }}
    >
      <SelectTrigger
        testId={testId}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={open}
        aria-disabled={disabled}
        {...info}
        disabled={disabled}
        style={sx(
          controlChrome(
            theme,
            size
          )({ active: open ? "on" : "off", disabled: disabled ? "on" : "off" }),
          { width: fill ? "100%" : width, justifyContent: "space-between" },
          style
        )}
      >
        {measured.sampleNodes}
        {icon ? <IconSlot size={size}>{icon}</IconSlot> : null}
        <div style={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }}>
          {typeof display === "string" ? (
            <text style={{ whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {display.replace(/\r?\n/g, " ")}
            </text>
          ) : (
            display
          )}
        </div>
        <text
          aria-hidden="true"
          style={{ flexShrink: 0, width: metrics["--spacing-control-icon"], textAlign: "right" }}
        >
          ⌄
        </text>
      </SelectTrigger>
      <SelectContent
        testId={testId ? `${testId}-content` : undefined}
        role="listbox"
        tabIndex={0}
        aria-disabled={disabled}
        aria-label={label}
        side={side}
        align={align}
        sideOffset={sideOffset}
        style={contentStyle}
      >
        {items.map(item =>
          "type" in item ? (
            item.type === "separator" ? (
              <SelectSeparator
                key={item.id}
                style={{
                  height: 1,
                  backgroundColor: theme.colors.border,
                  marginTop: 3,
                  marginBottom: 3,
                }}
              />
            ) : (
              <SelectLabel
                key={item.id}
                style={{
                  fontSize: metrics["--text-control-track"],
                  color: theme.colors.mutedForeground,
                  padding: metrics["--spacing-control-track-gap"],
                }}
              >
                <text>{item.label}</text>
              </SelectLabel>
            )
          ) : (
            <SelectItem
              key={item.id}
              value={item.id}
              disabled={item.disabled}
              role="option"
              aria-label={typeof item.label === "string" ? item.label : item.id}
              tabIndex={0}
              aria-disabled={item.disabled ?? false}
              aria-selected={item.id === value}
              style={state => ({
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                padding: metrics["--spacing-control-track-gap"],
                gap: metrics["--spacing-control-gap"],
                minHeight: metrics["--spacing-control-track"],
                whiteSpace: "normal",
                fontSize: metrics["--text-control-track"],
                backgroundColor: state.selected
                  ? theme.colors.primary
                  : state.highlighted
                    ? theme.colors.accent
                    : "transparent",
                color: state.selected
                  ? theme.colors.primaryForeground
                  : theme.colors.popoverForeground,
                opacity: state.disabled ? 0.5 : 1,
              })}
            >
              <text style={{ flexGrow: 1, whiteSpace: "normal" }}>{item.label}</text>
              {item.shortcut ? (
                <text style={{ flexShrink: 0, color: theme.colors.mutedForeground }}>
                  {item.shortcut}
                </text>
              ) : null}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  )
}
