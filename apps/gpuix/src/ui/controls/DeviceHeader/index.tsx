import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import { Icon } from "../Icon"
import type { Props } from "@gpuix/react"
import type { ReactNode } from "react"
import type { ButtonProps } from "../Button"

export interface DeviceHeaderProps extends Omit<Props, "title"> {
  readonly title: string
  readonly enabled: boolean
  readonly onEnabledChange: (enabled: boolean) => void
  readonly collapsed: boolean
  readonly onCollapsedChange: (collapsed: boolean) => void
  readonly labels: { readonly activator: string; readonly collapse: string }
  readonly titleButtonProps?: Omit<ButtonProps, "children">
  readonly actions?: ReactNode
}

export function DeviceHeader({
  title,
  enabled,
  onEnabledChange,
  collapsed,
  onCollapsedChange,
  labels,
  titleButtonProps,
  actions,
  style,
  ...props
}: DeviceHeaderProps) {
  const theme = useTheme()
  const unit = theme.control["--spacing-control-track"]
  return (
    <div
      {...props}
      style={sx(
        {
          display: "flex",
          flexDirection: collapsed ? "column" : "row",
          alignItems: "center",
          gap: unit,
          padding: unit / 2,
          height: collapsed ? undefined : theme.design.grid.headerHeightUnits * unit,
          width: collapsed ? theme.design.grid.headerHeightUnits * unit : undefined,
          flexShrink: 0,
          backgroundColor: theme.colors.muted,
        },
        style
      )}
    >
      <Button
        iconOnly
        tone="activator"
        label={labels.activator}
        active={enabled}
        onActiveChange={onEnabledChange}
        icon={
          <Icon
            name="Power"
            color={enabled ? theme.colors.primaryForeground : theme.colors.mutedForeground}
          />
        }
      />
      <Button
        iconOnly
        label={labels.collapse}
        aria-expanded={!collapsed}
        onClick={() => onCollapsedChange(!collapsed)}
        icon={<Icon name={collapsed ? "ChevronRight" : "ChevronDown"} />}
      />
      <Button
        {...titleButtonProps}
        iconOnly={collapsed}
        label={titleButtonProps?.label ?? title}
        style={sx(
          { flexGrow: 0, minWidth: 0, justifyContent: "flex-start" },
          titleButtonProps?.style
        )}
      >
        {collapsed ? null : title}
      </Button>
      {!collapsed && actions ? <div style={{ flexGrow: 1 }} /> : null}
      {!collapsed ? actions : null}
    </div>
  )
}
