import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { GripVertical } from "lucide-react"
import { deviceParameterKeys } from "@zoeydaw/project-core/devices"
import { ParameterControl } from "../ParameterControl"
import { DeviceDisplay } from "../DeviceDisplay"
import { ExternalParameters } from "../ExternalParameters"
import type { DeviceCardProps } from "./types"

type DeviceCardContentProps = Pick<
  DeviceCardProps,
  "trackId" | "device" | "selected" | "onSelect" | "onDragStart" | "onDragEnd"
> & {
  readonly name: string
}

export function DeviceCardContent({
  trackId,
  device,
  name,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: DeviceCardContentProps) {
  const { t } = useTranslation()
  if (device.collapsed) {
    return (
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
    )
  }
  return (
    <div
      className={`gap-control-gap p-control-pad-x flex min-h-0 flex-1 flex-col ${device.enabled ? "" : "opacity-50"}`}
    >
      <div className="min-h-8 flex-1 overflow-hidden rounded-sm">
        <DeviceDisplay device={device} />
      </div>
      {device.kind === "external" && <ExternalParameters trackId={trackId} device={device} />}
      {deviceParameterKeys(device).map(field => (
        <ParameterControl key={field} trackId={trackId} device={device} field={field} />
      ))}
    </div>
  )
}
