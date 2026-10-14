import { useTranslation } from "@zoeymind/i18n"
import { Button, DropdownButton } from "@zoeymind/ui"
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Power } from "lucide-react"
import { deviceParameterKeys } from "@/pages/project/model/devices"
import type { Device } from "@/pages/project/model/devices"
import type { DragEvent, KeyboardEvent } from "react"
import { ParameterControl } from "../ParameterControl"
import { DeviceDisplay } from "../DeviceDisplay"

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
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onKeyDown,
}: {
  readonly trackId: string
  readonly device: Device
  readonly selected: boolean
  readonly first: boolean
  readonly last: boolean
  readonly dragging: boolean
  readonly onSelect: () => void
  readonly onToggle: () => void
  readonly dropTarget: boolean
  readonly onFold: () => void
  readonly onDelete: () => void
  readonly onMove: (direction: -1 | 1) => void
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
  readonly onDragEnd: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}) {
  const { t } = useTranslation()
  const name = t(`detailDevices.kinds.${device.kind}`)
  return (
    <li
      aria-label={name}
      aria-current={selected ? "true" : undefined}
      aria-describedby={`device-help-${trackId}`}
      data-device-id={device.id}
      data-selected={selected || undefined}
      data-enabled={device.enabled}
      data-drop-target={dropTarget || undefined}
      data-collapsed={device.collapsed}
      onFocus={onSelect}
      onPointerDown={event => {
        onSelect()
        if (event.target instanceof HTMLElement && !event.target.closest("button,input")) {
          event.currentTarget.querySelector<HTMLElement>("[data-device-select]")?.focus()
        }
      }}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`border-border bg-background/30 focus-visible:border-ring flex h-full shrink-0 flex-col overflow-hidden rounded-sm border outline-none ${dropTarget ? "border-primary" : selected ? "border-ring" : ""} ${dragging ? "opacity-50" : ""} ${device.collapsed ? "w-[calc(var(--control-h)+var(--control-gap)*2)]" : "w-64"}`}
    >
      <div
        className={`bg-muted-foreground/10 gap-control-gap p-control-gap flex shrink-0 items-center ${device.collapsed ? "flex-col" : ""}`}
      >
        <Button
          size="control-icon"
          variant={device.enabled ? "secondary" : "ghost"}
          aria-pressed={device.enabled}
          aria-label={t(device.enabled ? "detailDevices.bypass" : "detailDevices.enable", {
            device: name,
          })}
          onClick={onToggle}
        >
          <Power />
        </Button>
        <Button
          size="control-icon"
          variant="ghost"
          aria-expanded={!device.collapsed}
          aria-label={t(device.collapsed ? "detailDevices.expand" : "detailDevices.fold", {
            device: name,
          })}
          onClick={onFold}
        >
          {device.collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        {!device.collapsed && (
          <Button
            data-device-select
            size="control"
            variant="ghost"
            aria-pressed={selected}
            aria-label={t("detailDevices.select", { device: name })}
            className="min-w-0 flex-1 justify-start truncate"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onSelect}
          >
            <GripVertical />
            <span className="truncate">{name}</span>
          </Button>
        )}
        {!device.collapsed && (
          <DropdownButton
            size="compact"
            value="actions"
            label={t("detailDevices.actions", { device: name })}
            renderValue={() => <MoreHorizontal className="size-control-icon" />}
            mappable={false}
            matchTriggerWidth={false}
            side="top"
            align="end"
            items={[
              {
                id: "left",
                label: t("detailDevices.moveLeft"),
                disabled: first,
                shortcut: t("detailDevices.moveLeftShortcut"),
              },
              {
                id: "right",
                label: t("detailDevices.moveRight"),
                disabled: last,
                shortcut: t("detailDevices.moveRightShortcut"),
              },
              { type: "separator", id: "separator" },
              {
                id: "delete",
                label: t("detailDevices.delete"),
                shortcut: t("detailDevices.deleteShortcut"),
              },
            ]}
            onChange={action => {
              if (action === "left") onMove(-1)
              else if (action === "right") onMove(1)
              else if (action === "delete") onDelete()
            }}
          />
        )}
      </div>
      {device.collapsed ? (
        <div className="gap-control-gap flex min-h-0 flex-1 flex-col items-center overflow-hidden">
          <Button
            data-device-select
            size="control-icon"
            variant="ghost"
            aria-pressed={selected}
            aria-label={t("detailDevices.select", { device: name })}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onSelect}
          >
            <GripVertical />
          </Button>
          <span className="pointer-events-none truncate [writing-mode:vertical-rl]">{name}</span>
        </div>
      ) : (
        <div
          className={`gap-control-gap p-control-pad-x flex min-h-0 flex-1 flex-col ${device.enabled ? "" : "opacity-50"}`}
        >
          <div className="min-h-8 flex-1 overflow-hidden rounded-sm">
            <DeviceDisplay device={device} />
          </div>
          {deviceParameterKeys(device).map(field => (
            <ParameterControl key={field} trackId={trackId} device={device} field={field} />
          ))}
        </div>
      )}
    </li>
  )
}
