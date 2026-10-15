import { useRef } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx, sv } from "@/shared/theme/style"
import { Button } from "../Button"
import { isActivationKey, navigateSelection } from "../RadioGroup/keyboard"
import type { Props, PublicInstance, StyleDesc } from "@gpuix/react"
import type { ReactNode } from "react"
import type { SelectionEntry } from "../RadioGroup/keyboard"

export interface SettingsNavItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  content?: ReactNode
}
export interface SettingsNavItemProps extends Omit<Props, "ref"> {
  item: SettingsNavItem
  selected: boolean
  onSelect: (id: string) => void
  itemRef?: (node: PublicInstance | null) => void
}
export function SettingsNavItem({
  item,
  selected,
  onSelect,
  itemRef,
  style,
  onKeyDown,
  ...props
}: SettingsNavItemProps) {
  const theme = useTheme()
  const variants = sv({
    base: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      height: theme.control["--spacing-control-track"],
      fontSize: theme.control["--text-control-track"],
      color: theme.colors.foreground,
      paddingLeft: 8,
      paddingRight: 8,
      borderRadius: 3,
      cursor: "pointer",
      userSelect: "none",
      keyboardFocusDim: false,
      focusVisible: item.disabled
        ? undefined
        : { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
    },
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.primary, color: theme.colors.primaryForeground },
        false: { hover: { backgroundColor: theme.colors.muted } },
      },
      disabled: { true: { opacity: 0.5, cursor: "not-allowed" }, false: {} },
    },
  })
  return (
    <div
      {...props}
      ref={itemRef}
      role="tab"
      tabIndex={0}
      aria-label={item.label}
      aria-selected={selected}
      aria-disabled={!!item.disabled}
      style={sx(
        variants({
          selected: selected ? "true" : "false",
          disabled: item.disabled ? "true" : "false",
        }),
        style
      )}
      onClick={event => {
        if (!item.disabled) {
          onSelect(item.id)
          props.onClick?.(event)
        }
      }}
      onKeyDown={event => {
        if (!item.disabled) {
          if (isActivationKey(event)) onSelect(item.id)
          onKeyDown?.(event)
        }
      }}
    >
      {item.icon}
      {item.label}
    </div>
  )
}

export interface SettingsShellProps extends Omit<Props, "children"> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  items: SettingsNavItem[]
  activeId: string
  onActiveChange: (id: string) => void
  children?: ReactNode
  renderPane?: (id: string) => ReactNode
  contentStyle?: StyleDesc
  navigationWidth?: number
  closeLabel?: string
  navigationLabel?: string
}
export function SettingsShell({
  open,
  onOpenChange,
  title,
  description,
  items,
  activeId,
  onActiveChange,
  children,
  renderPane,
  contentStyle,
  navigationWidth = 168,
  closeLabel = "Close settings",
  navigationLabel = "Settings sections",
  style,
  onKeyDown,
  ...props
}: SettingsShellProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const entries = useRef(new Map<string, SelectionEntry>()).current
  if (!open) return null
  const selected = items.find(item => item.id === activeId)
  return (
    <div
      {...props}
      role="group"
      tabIndex={0}
      aria-disabled={false}
      style={sx(
        {
          display: "flex",
          flexDirection: "column",
          width: 720,
          height: 520,
          backgroundColor: theme.colors.background,
          color: theme.colors.foreground,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 4,
          overflow: "hidden",
          keyboardFocusDim: false,
        },
        style
      )}
      onKeyDown={event => {
        if (event.key === "escape") onOpenChange(false)
        onKeyDown?.(event)
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          padding: 12,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            role="heading"
            aria-level={1}
            style={{ fontSize: theme.control["--text-control-track"], fontWeight: 600 }}
          >
            {title}
          </div>
          {description ? (
            <div
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.control["--text-control-track"],
              }}
            >
              {description}
            </div>
          ) : null}
        </div>
        <Button
          iconOnly
          label={closeLabel}
          icon={<text style={{ fontSize: theme.control["--spacing-control-icon"] }}>×</text>}
          onClick={() => onOpenChange(false)}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", flexGrow: 1, minHeight: 0 }}>
        <div
          role="tablist"
          aria-label={navigationLabel}
          style={{
            display: "flex",
            flexDirection: "column",
            width: navigationWidth,
            flexShrink: 0,
            gap: 2,
            padding: 8,
            overflowY: "auto",
            backgroundColor: theme.colors.editorShell,
            borderRightWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {items.map(item => (
            <SettingsNavItem
              key={item.id}
              item={item}
              selected={item.id === activeId}
              onSelect={onActiveChange}
              testId={`settings-nav-${item.id}`}
              itemRef={node => {
                if (node) entries.set(item.id, { value: item.id, disabled: !!item.disabled, node })
                else entries.delete(item.id)
              }}
              onKeyDown={event => {
                if (event.key === "escape") onOpenChange(false)
                else
                  navigateSelection({
                    event,
                    value: item.id,
                    entries,
                    renderer,
                    orientation: "vertical",
                    select: onActiveChange,
                  })
              }}
            />
          ))}
        </div>
        <div
          role="tabpanel"
          aria-label={selected?.label}
          style={sx({ flexGrow: 1, minWidth: 0, overflowY: "auto", padding: 16 }, contentStyle)}
        >
          {renderPane ? renderPane(activeId) : (selected?.content ?? children)}
        </div>
      </div>
    </div>
  )
}
