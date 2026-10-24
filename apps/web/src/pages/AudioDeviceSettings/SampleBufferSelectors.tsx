import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DropdownButton, Label } from "@zoeymind/ui"
import type { AudioDeviceCapabilities, AudioDeviceConfiguration } from "@/shared/native/audio"

export function SampleBufferSelectors({
  draft,
  capabilities,
  busy,
  onChange,
}: {
  draft: AudioDeviceConfiguration | null
  capabilities: AudioDeviceCapabilities | null
  busy: boolean
  onChange: Dispatch<SetStateAction<AudioDeviceConfiguration | null>>
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("audioSettings.requestedRate")}</Label>
        <DropdownButton
          label={t("audioSettings.requestedRate")}
          value={String(draft?.sampleRate ?? 0)}
          items={
            capabilities?.sampleRates.map(value => ({
              id: String(value),
              label: value > 0 ? t("audioSettings.hertz", { value: value.toLocaleString() }) : "—",
            })) ?? []
          }
          renderValue={item => item?.label ?? t("audioSettings.noCapabilities")}
          disabled={busy || !capabilities || capabilities.sampleRates.length === 0}
          mappable={false}
          size="compact"
          onChange={value =>
            onChange(previous => previous && { ...previous, sampleRate: Number(value) })
          }
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("audioSettings.bufferSize")}</Label>
        <DropdownButton
          label={t("audioSettings.bufferSize")}
          value={String(draft?.bufferFrames ?? 0)}
          items={
            capabilities?.bufferSizes.map(value => ({
              id: String(value),
              label: value > 0 ? t("audioSettings.frames", { count: value }) : "—",
            })) ?? []
          }
          renderValue={item => item?.label ?? t("audioSettings.noCapabilities")}
          disabled={busy || !capabilities || capabilities.bufferSizes.length === 0}
          mappable={false}
          size="compact"
          onChange={value =>
            onChange(previous => previous && { ...previous, bufferFrames: Number(value) })
          }
        />
      </div>
    </>
  )
}
