import { useTranslation } from "@zoeymind/i18n"
import { Button, DropdownButton } from "@zoeymind/ui"
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Power } from "lucide-react"
import type { DeviceCardProps } from "./types"

type DeviceCardActionsProps = Pick<DeviceCardProps, "first" | "last" | "onMove" | "onDelete"> & {
  readonly name: string
}

function DeviceCardActions({ name, first, last, onMove, onDelete }: DeviceCardActionsProps) {
  const { t } = useTranslation()
  return (
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
  )
}

type DeviceCardHeaderProps = Pick<
  DeviceCardProps,
  "device" | "selected" | "onToggle" | "onFold" | "onSelect" | "onDragStart" | "onDragEnd"
> &
  DeviceCardActionsProps

export function DeviceCardHeader({
  name,
  device,
  selected,
  first,
  last,
  onToggle,
  onFold,
  onSelect,
  onDragStart,
  onDragEnd,
  onMove,
  onDelete,
}: DeviceCardHeaderProps) {
  const { t } = useTranslation()
  return (
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
        <DeviceCardActions
          name={name}
          first={first}
          last={last}
          onMove={onMove}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}
