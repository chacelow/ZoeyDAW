import { useTranslation } from "@zoeymind/i18n"
import { Button } from "@zoeymind/ui"
import { GripVertical } from "lucide-react"
import { deviceParameterKeys } from "@zoeydaw/project-core/devices"
import { ParameterControl } from "../ParameterControl"
import { DeviceDisplay } from "../DeviceDisplay"
import { ExternalParameters } from "../ExternalParameters"
import type { DeviceCardProps } from "./types"
import { ProjectMeter } from "@/pages/project/components/ProjectMeter"

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
      <div className="gap-control-gap flex min-h-0 flex-1 overflow-hidden">
        <div className="gap-control-gap flex min-w-0 flex-1 flex-col items-center">
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
        <ProjectMeter
          source={{ kind: "device", deviceId: device.id, side: "out" }}
          className="h-full w-3"
          label={t("detailDevices.outputLevel", { device: name })}
        />
      </div>
    )
  }
  return (
    <div
      className={`gap-control-gap p-control-pad-x flex min-h-0 flex-1 ${device.enabled ? "" : "opacity-50"}`}
    >
      <div className="gap-control-gap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="gap-control-gap flex min-h-8 shrink-0 overflow-hidden rounded-sm">
          {device.kind === "external" && device.plugin.role === "instrument" ? null : (
            <ProjectMeter
              source={{ kind: "device", deviceId: device.id, side: "in" }}
              className="h-full w-3"
              label={t("detailDevices.inputLevel", { device: name })}
            />
          )}
          <div className="min-w-0 flex-1">
            <DeviceDisplay device={device} />
          </div>
        </div>
        {device.kind === "external" && <ExternalParameters trackId={trackId} device={device} />}
        {device.kind !== "external" &&
          deviceParameterKeys(device).map(field => (
            <ParameterControl key={field} trackId={trackId} device={device} field={field} />
          ))}
      </div>
      <ProjectMeter
        source={{ kind: "device", deviceId: device.id, side: "out" }}
        className="h-full w-3"
        label={t("detailDevices.outputLevel", { device: name })}
      />
    </div>
  )
}
