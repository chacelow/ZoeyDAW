import { DragPadBar } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useProjectEditGesture } from "@/project/adapters"
import {
  DEVICE_PARAMETERS,
  deviceParameterValue,
  withDeviceParameter,
} from "@/project/model/devices"
import type { Device, DeviceParameter } from "@/project/model/devices"
import { editDevices } from "../edit-devices"
import type { FooterLabels } from "../../labels"

export function ParameterControl({
  trackId,
  device,
  field,
  labels,
}: {
  readonly trackId: string
  readonly device: Device
  readonly field: DeviceParameter
  readonly labels: FooterLabels
}) {
  const theme = useTheme()
  const config = DEVICE_PARAMETERS[field]
  const value = deviceParameterValue(device, field)
  const gesture = useProjectEditGesture((next: number) => {
    editDevices(trackId, devices =>
      devices.map(item => (item.id === device.id ? withDeviceParameter(item, field, next) : item))
    )
  })
  if (value === undefined) return null
  const language = labels.locale
  const percentage = config.unit === "pan" || config.unit === "ratioPercent"
  const number = new Intl.NumberFormat(language, {
    useGrouping: false,
    maximumFractionDigits: percentage ? 0 : config.step < 1 ? 1 : 0,
  })
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.control["--spacing-control-gap"],
      }}
    >
      <text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        {labels.parameterNames[field]}
      </text>
      <DragPadBar
        label={labels.parameterNames[field]}
        value={value}
        min={config.min}
        max={config.max}
        step={config.step}
        defaultValue={config.defaultValue}
        format={next => number.format(percentage ? next * 100 : next)}
        parse={raw => {
          const decimal =
            new Intl.NumberFormat(language).formatToParts(1.1).find(part => part.type === "decimal")
              ?.value ?? "."
          const parsed = Number(raw.trim().replace(decimal, "."))
          return percentage ? parsed / 100 : parsed
        }}
        {...gesture}
      />
    </div>
  )
}
