import {
  Button,
  DeviceHeader,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ui/controls"
import { DropdownMenuSeparator } from "@/ui/controls/Menu"
import { Icon } from "@/ui/controls/Icon"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { deviceParameterKeys } from "@/project/model/devices"
import type { Device } from "@/project/model/devices"
import type { Props, PublicInstance } from "@gpuix/react"
import { ParameterControl } from "../ParameterControl"
import { DeviceDisplay } from "../DeviceDisplay"
import type { FooterLabels } from "../../labels"

export interface DeviceCardProps {
  readonly labels: FooterLabels
  readonly trackId: string
  readonly device: Device
  readonly selected: boolean
  readonly first: boolean
  readonly last: boolean
  readonly dragging: boolean
  readonly dropTarget: boolean
  readonly onSelect: () => void
  readonly onToggle: () => void
  readonly onFold: () => void
  readonly onDelete: () => void
  readonly onMove: (direction: -1 | 1) => void
  readonly register: (node: PublicInstance | null) => void
  readonly registerHandle: (node: PublicInstance | null) => void
  readonly handleProps: Pick<
    Props,
    "onMouseDown" | "onMouseMove" | "onMouseUp" | "onBlur" | "onKeyDown" | "onFocus"
  >
}

export function DeviceCard({
  trackId,
  device,
  selected,
  first,
  last,
  dragging,
  dropTarget,
  onSelect,
  onToggle,
  onFold,
  onDelete,
  onMove,
  register,
  registerHandle,
  handleProps,
  labels,
}: DeviceCardProps) {
  const theme = useTheme()
  const gap = theme.control["--spacing-control-gap"]
  const name = labels.kindNames[device.kind]
  return (
    <div
      ref={register}
      role="listitem"
      aria-label={name}
      aria-current={selected ? "true" : undefined}
      testId={`device-${device.id}`}
      onMouseDown={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
        width: device.collapsed
          ? theme.design.grid.headerHeightUnits * theme.control["--spacing-control-track"] +
            theme.design.shape.cardBorderWidth * 2
          : theme.project.deviceCardWidth,
        borderWidth: theme.design.shape.cardBorderWidth,
        borderColor: dropTarget
          ? theme.colors.primary
          : selected
            ? theme.colors.ring
            : theme.colors.border,
        backgroundColor: theme.colors.muted,
        opacity: dragging ? theme.design.states.deviceDragSourceOpacity : 1,
        overflow: "hidden",
      }}
    >
      <DeviceHeader
        title={name}
        enabled={device.enabled}
        onEnabledChange={onToggle}
        collapsed={device.collapsed}
        onCollapsedChange={onFold}
        labels={{
          activator: `${device.enabled ? labels.bypass : labels.enable} ${name}`,
          collapse: `${device.collapsed ? labels.expand : labels.fold} ${name}`,
        }}
        titleButtonProps={{
          ...handleProps,
          ref: registerHandle,
          icon: (
            <Icon
              name="GripVertical"
              color={selected ? theme.colors.primaryForeground : theme.colors.mutedForeground}
            />
          ),
          label: `${labels.select} ${name}`,
          active: selected,
          testId: `device-handle-${device.id}`,
          "aria-description": labels.keyboardHelp,
          onActiveChange: onSelect,
          style: { cursor: dragging ? theme.design.cursors.grabbing : theme.design.cursors.grab },
        }}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                iconOnly
                label={`${labels.actions} ${name}`}
                icon={<Icon name="Ellipsis" color={theme.colors.foreground} />}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" aria-label={`${labels.actions} ${name}`}>
              <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
                {labels.moveLeft}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
                {labels.moveRight}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete}>{labels.delete}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {device.collapsed ? (
        <text
          aria-label={name}
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.control["--text-control-track"],
            lineHeight: theme.control["--text-control-track"],
            textAlign: "center",
          }}
        >
          {Array.from(name).join("\n")}
        </text>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap,
            padding: theme.control["--spacing-control-track-pad"],
            flexGrow: 1,
            minHeight: 0,
            opacity: device.enabled ? 1 : theme.design.states.disabledOpacity,
          }}
        >
          <DeviceDisplay device={device} />
          {deviceParameterKeys(device).map(field => (
            <ParameterControl
              key={field}
              trackId={trackId}
              device={device}
              field={field}
              labels={labels}
            />
          ))}
        </div>
      )}
    </div>
  )
}
