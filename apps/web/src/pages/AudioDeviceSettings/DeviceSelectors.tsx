import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton, Label } from "@zoeymind/ui"
import type { AudioDeviceConfiguration, AudioDeviceSnapshot } from "@/shared/native/audio"
import { selectHost, selectInput, selectOutput, type DeviceChoices } from "./deviceConfiguration"

export function DeviceSelectors({
  draft,
  device,
  choices,
  busy,
  onChange,
}: {
  draft: AudioDeviceConfiguration | null
  device: AudioDeviceSnapshot | null
  choices: DeviceChoices
  busy: boolean
  onChange: (next: AudioDeviceConfiguration) => void
}) {
  const { t } = useTranslation()
  const { hosts, inputs, outputs } = choices
  const host = draft?.host
  const inputDeviceId = draft?.inputDeviceId ?? null
  const outputDeviceId = draft?.outputDeviceId ?? null

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("audioSettings.host")}</Label>
        <DropdownButton
          label={t("audioSettings.host")}
          value={host ?? ""}
          items={hosts.map(item => ({ id: item.id, label: item.name }))}
          renderValue={item => item?.label ?? host ?? t("audioSettings.noHost")}
          disabled={busy || !draft || hosts.length === 0}
          mappable={false}
          size="compact"
          onChange={host => {
            if (draft) onChange(selectHost(draft, host, device))
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("audioSettings.inputDevice")}</Label>
        <DropdownButton
          label={t("audioSettings.inputDevice")}
          value={inputDeviceId ?? ""}
          items={[
            { id: "", label: t("audioSettings.noInput") },
            ...inputs.map(item => ({ id: item.id, label: item.name })),
          ]}
          disabled={busy || !draft}
          mappable={false}
          size="compact"
          onChange={value => {
            if (draft) onChange(selectInput(draft, value, choices))
          }}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("audioSettings.outputDevice")}</Label>
        <DropdownButton
          label={t("audioSettings.outputDevice")}
          value={outputDeviceId ?? ""}
          items={outputs.map(item => ({ id: item.id, label: item.name }))}
          renderValue={item => item?.label ?? outputDeviceId ?? t("audioSettings.noDevice")}
          disabled={busy || !draft || outputs.length === 0}
          mappable={false}
          size="compact"
          onChange={value => {
            if (draft) onChange(selectOutput(draft, value, device, choices))
          }}
        />
      </div>
    </>
  )
}
