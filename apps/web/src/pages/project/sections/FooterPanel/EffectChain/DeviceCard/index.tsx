import { useTranslation } from "@zoeymind/i18n"
import { DeviceCardHeader } from "./DeviceCardHeader"
import { DeviceCardContent } from "./DeviceCardContent"
import type { DeviceCardProps } from "./types"

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
}: DeviceCardProps) {
  const { t } = useTranslation()
  const name =
    device.kind === "external" ? device.plugin.name : t(`detailDevices.kinds.${device.kind}`)
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
      <DeviceCardHeader
        name={name}
        device={device}
        selected={selected}
        first={first}
        last={last}
        onToggle={onToggle}
        onFold={onFold}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMove={onMove}
        onDelete={onDelete}
      />
      <DeviceCardContent
        trackId={trackId}
        device={device}
        name={name}
        selected={selected}
        onSelect={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    </li>
  )
}
