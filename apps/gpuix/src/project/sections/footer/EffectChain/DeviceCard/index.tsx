import { Button, DropdownButton } from "../../../../../ui/controls"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { deviceParameterKeys } from "../../../../model/devices"
import type { Device } from "../../../../model/devices"
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
    "onMouseDown" | "onMouseMove" | "onMouseUp" | "onBlur" | "onKeyDown"
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
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
        width: device.collapsed
          ? theme.control["--spacing-control-track"] + gap * 2
          : theme.project.deviceCardWidth,
        borderWidth: 1,
        borderColor: dropTarget
          ? theme.colors.primary
          : selected
            ? theme.colors.ring
            : theme.colors.border,
        backgroundColor: theme.colors.muted,
        opacity: dragging ? 0.5 : 1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: device.collapsed ? "column" : "row",
          alignItems: "center",
          gap,
          padding: gap,
          flexShrink: 0,
        }}
      >
        <Button
          iconOnly
          label={`${device.enabled ? labels.bypass : labels.enable} ${name}`}
          active={device.enabled}
          onClick={onToggle}
        >
          ◉
        </Button>
        <Button
          iconOnly
          label={`${device.collapsed ? labels.expand : labels.fold} ${name}`}
          aria-expanded={!device.collapsed}
          onClick={onFold}
        >
          {device.collapsed ? "›" : "⌄"}
        </Button>
        <Button
          {...handleProps}
          ref={registerHandle}
          label={`${labels.select} ${name}`}
          active={selected}
          testId={`device-handle-${device.id}`}
          onClick={onSelect}
          style={{
            flexGrow: device.collapsed ? 0 : 1,
            minWidth: 0,
            justifyContent: "flex-start",
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          {device.collapsed ? "⋮" : name}
        </Button>
        {!device.collapsed ? (
          <DropdownButton
            value="actions"
            label={`${labels.actions} ${name}`}
            renderValue={() => "⋯"}
            side="top"
            align="end"
            matchTriggerWidth={false}
            items={[
              { id: "left", label: labels.moveLeft, disabled: first },
              { id: "right", label: labels.moveRight, disabled: last },
              { type: "separator", id: "sep" },
              { id: "delete", label: labels.delete },
            ]}
            onChange={action => {
              if (action === "left") onMove(-1)
              else if (action === "right") onMove(1)
              else if (action === "delete") onDelete()
            }}
          />
        ) : null}
      </div>
      {device.collapsed ? (
        <text
          style={{
            color: theme.colors.mutedForeground,
            fontSize: theme.control["--text-control-track"],
          }}
        >
          {name}
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
            opacity: device.enabled ? 1 : 0.5,
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
