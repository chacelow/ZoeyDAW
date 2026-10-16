import { consumeKey } from "@/shared/keyboard"
import { useRef, useState } from "react"
import { motion, useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { navigateSelection } from "../RadioGroup/keyboard"
import type { Props, StyleDesc } from "@gpuix/react"
import type { ReactNode } from "react"
import type { SelectionEntry } from "../RadioGroup/keyboard"

export interface TabOption {
  key: string
  label: string
  icon?: ReactNode
  content?: ReactNode
  disabled?: boolean
}
export interface MotionTabsProps extends Omit<Props, "onChange"> {
  options: TabOption[]
  defaultTab?: string
  value?: string
  onChange?: (tabKey: string) => void
  showContent?: boolean
  tabWidth?: number
  containerStyle?: StyleDesc
  tabStyle?: StyleDesc
  contentStyle?: StyleDesc
  reducedMotion?: boolean
}

export function MotionTabs({
  options,
  defaultTab,
  value,
  onChange,
  showContent = true,
  tabWidth = 120,
  containerStyle,
  tabStyle,
  contentStyle,
  reducedMotion = false,
  style,
  ...props
}: MotionTabsProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const entries = useRef(new Map<string, SelectionEntry>()).current
  const [selection, setSelection] = useState({
    defaultTab,
    key: defaultTab ?? options.find(option => !option.disabled)?.key ?? "",
  })
  if (selection.defaultTab !== defaultTab)
    setSelection({ defaultTab, key: defaultTab ?? selection.key })
  const requested = value ?? selection.key
  const selected =
    options.find(option => option.key === requested && !option.disabled) ??
    options.find(option => !option.disabled)
  const selectedIndex = options.findIndex(option => option.key === selected?.key)
  const select = (key: string) => {
    if (key === selected?.key) return
    if (value === undefined) setSelection({ defaultTab, key })
    onChange?.(key)
  }
  const variants = sv({
    base: {
      height: theme.control["--spacing-control-track"],
      width: tabWidth,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.design.tabs.itemGap,
      fontSize: theme.control["--text-control-track"],
      color: theme.colors.mutedForeground,
      cursor: "pointer",
      userSelect: "none",
      keyboardFocusDim: false,
      focusVisible: {
        outlineWidth: theme.design.shape.focusRingWidth,
        outlineColor: theme.colors.ring,
        outlineOffset: -theme.design.shape.focusRingWidth,
      },
    },
    variants: {
      selected: {
        true: { color: theme.colors.foreground, fontWeight: 600 },
        false: { hover: { backgroundColor: theme.colors.muted } },
      },
      disabled: {
        true: {
          opacity: 0.5,
          cursor: "not-allowed",
          focusVisible: undefined,
          hover: { backgroundColor: "transparent" },
          active: { backgroundColor: "transparent" },
        },
        false: {},
      },
    },
  })
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          gap: theme.design.tabs.contentGap,
          minWidth: 0,
        },
        style
      )}
    >
      <div
        role="tablist"
        style={sx(
          {
            display: "flex",
            flexDirection: "row",
            position: "relative",
            overflowX: "auto",
            backgroundColor: theme.colors.muted,
            borderRadius: theme.design.shape.controlRadius,
          },
          containerStyle
        )}
      >
        {selectedIndex !== -1 ? (
          <motion.div
            key={selected?.key}
            initial={{ opacity: reducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
            style={{
              position: "absolute",
              left: selectedIndex * tabWidth,
              width: tabWidth,
              top: 0,
              height: theme.control["--spacing-control-track"],
              backgroundColor: theme.colors.background,
              borderRadius: theme.design.shape.controlRadius,
              pointerEvents: "none",
            }}
          >
            <div testId="motion-tabs-indicator" style={{ width: "100%", height: "100%" }} />
          </motion.div>
        ) : null}
        {options.map(option => (
          <div
            key={option.key}
            role="tab"
            tabIndex={0}
            aria-label={option.label}
            aria-selected={selected?.key === option.key}
            aria-disabled={!!option.disabled}
            testId={`motion-tab-${option.key}`}
            ref={node => {
              if (node)
                entries.set(option.key, { value: option.key, disabled: !!option.disabled, node })
              else entries.delete(option.key)
            }}
            style={sx(
              variants({
                selected: selected?.key === option.key ? "true" : "false",
                disabled: option.disabled ? "true" : "false",
              }),
              tabStyle
            )}
            onClick={() => {
              if (!option.disabled) select(option.key)
            }}
            onKeyDown={event => {
              if (option.disabled) return
              if (event.key === "enter") {
                select(option.key)
                consumeKey(event, "handled")
              } else
                navigateSelection({
                  event,
                  value: option.key,
                  entries,
                  renderer,
                  orientation: "horizontal",
                  select,
                })
            }}
          >
            {option.icon}
            {option.label}
          </div>
        ))}
      </div>
      {showContent && selected ? (
        <div role="tabpanel" aria-label={selected.label} style={contentStyle}>
          {selected.content}
        </div>
      ) : null}
    </div>
  )
}
