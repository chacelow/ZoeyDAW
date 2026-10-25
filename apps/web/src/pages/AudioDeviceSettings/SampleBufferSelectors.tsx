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
  onChange: (next: AudioDeviceConfiguration) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="settings-row">
        <Label>{t("audioSettings.requestedRate")}</Label>
        <div className="min-w-0">
          <DropdownButton
            label={t("audioSettings.requestedRate")}
            value={String(draft?.sampleRate ?? 0)}
            items={
              capabilities?.sampleRates.map(value => ({
                id: String(value),
                label:
                  value > 0 ? t("audioSettings.hertz", { value: value.toLocaleString() }) : "—",
              })) ?? []
            }
            renderValue={item => item?.label ?? t("audioSettings.noCapabilities")}
            disabled={busy || !capabilities || capabilities.sampleRates.length === 0}
            mappable={false}
            size="compact"
            onChange={value => {
              if (draft) onChange({ ...draft, sampleRate: Number(value) })
            }}
          />
        </div>
      </div>
      <div className="settings-row">
        <Label>{t("audioSettings.bufferSize")}</Label>
        <div className="min-w-0">
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
            onChange={value => {
              if (draft) onChange({ ...draft, bufferFrames: Number(value) })
            }}
          />
        </div>
      </div>
    </>
  )
}
