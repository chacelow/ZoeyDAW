import { DragPadNumber } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { sampleSettingFields } from "./fieldConfiguration"
import type { SampleSettingField } from "./fieldConfiguration"
import type { AudioClipContent } from "@zoeydaw/project-core/types"

export function SampleSettingNumber({
  clip,
  bpm,
  field,
  label,
  unit,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly field: SampleSettingField
  readonly label: string
  readonly unit: string
}) {
  const { t } = useTranslation()
  const unknownTempo = field === "sourceBpm" && clip.sourceTempo === "unknown"
  const settings = getAudioClipSettings(clip, bpm)
  const configuration = sampleSettingFields[field]
  const gesture = useProjectEditGesture((value: number) => {
    projectActions.updateClip(clip.id, {
      ...(field === "sourceBpm" && { sourceTempo: undefined }),
      audioSettings: { ...settings, [field]: value },
    })
  })
  return (
    <label className="audio-detail-field">
      <span>{label}</span>
      <DragPadNumber
        size="compact"
        label={label}
        value={settings[field]}
        min={configuration.min}
        max={configuration.max}
        step={configuration.step}
        defaultValue={configuration.defaultValue(bpm)}
        format={value =>
          unknownTempo
            ? t("detailAudio.unknownTempo")
            : `${value.toFixed(configuration.decimalPlaces)}${unit ? ` ${unit}` : ""}`
        }
        {...gesture}
      />
    </label>
  )
}
