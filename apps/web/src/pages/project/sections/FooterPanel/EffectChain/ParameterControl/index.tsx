import { useTranslation } from "@zoeymind/i18n"
import { DragPadBar } from "@zoeymind/ui"
import { useAutomationGesture } from "@/pages/project/adapters"
import {
  DEVICE_PARAMETERS,
  deviceParameterValue,
  withDeviceParameter,
} from "@zoeydaw/project-core/devices"
import type { Device, DeviceParameter } from "@zoeydaw/project-core/devices"
import { editDevices } from "../edit-devices"

export function ParameterControl({
  trackId,
  device,
  field,
}: {
  readonly trackId: string
  readonly device: Device
  readonly field: DeviceParameter
}) {
  const { t, i18n } = useTranslation()
  const config = DEVICE_PARAMETERS[field]
  const value = deviceParameterValue(device, field)
  const gesture = useAutomationGesture(
    trackId,
    { kind: "device", deviceId: device.id, parameter: field },
    (next: number) => {
      editDevices(trackId, devices =>
        devices.map(item => (item.id === device.id ? withDeviceParameter(item, field, next) : item))
      )
    },
    value ?? config.defaultValue
  )
  if (value === undefined) return null
  const label = t(`detailDevices.parameters.${field}`)
  const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    useGrouping: false,
    maximumFractionDigits:
      config.unit === "pan" || config.unit === "ratioPercent" ? 0 : config.step < 1 ? 1 : 0,
  })
  const format = (next: number) =>
    number.format(config.unit === "pan" || config.unit === "ratioPercent" ? next * 100 : next)
  return (
    <div className="gap-control-gap flex min-w-0 items-center justify-between">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <DragPadBar
        label={label}
        size="compact"
        min={config.min}
        max={config.max}
        step={config.step}
        defaultValue={config.defaultValue}
        format={format}
        parse={raw => {
          const decimal =
            new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language)
              .formatToParts(1.1)
              .find(part => part.type === "decimal")?.value ?? "."
          const parsed = Number(raw.trim().replace(decimal, "."))
          return config.unit === "ratioPercent" || config.unit === "pan" ? parsed / 100 : parsed
        }}
        className="shrink-0"
        {...gesture}
      />
    </div>
  )
}
