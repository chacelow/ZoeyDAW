import { useTranslation } from "@zoeymind/i18n"
import { Button, DragPadNumber } from "@zoeymind/ui"
import {
  getAudioClipSettings,
  isAudioWarpMarkers,
  type AudioWarpMarker,
} from "@zoeydaw/project-core/audio-editor"
import type { AudioClipContent } from "@zoeydaw/project-core/types"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"

function MarkerValue({
  clip,
  bpm,
  index,
  field,
  label,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly index: number
  readonly field: "sourceBar" | "targetBar"
  readonly label: string
}) {
  const settings = getAudioClipSettings(clip, bpm)
  const markers = settings.warpMarkers ?? []
  const gesture = useProjectEditGesture((value: number) => {
    const next = markers.map((marker, item) =>
      item === index ? { ...marker, [field]: value } : marker
    )
    if (isAudioWarpMarkers(next))
      projectActions.updateClip(clip.id, { audioSettings: { ...settings, warpMarkers: next } })
  })
  return (
    <DragPadNumber
      size="compact"
      label={label}
      value={markers[index][field]}
      min={(markers[index - 1]?.[field] ?? 0) + 1 / 16384}
      max={(markers[index + 1]?.[field] ?? Number.MAX_SAFE_INTEGER) - 1 / 16384}
      step={1 / 64}
      format={value => value.toFixed(3)}
      disabled={!settings.warp}
      {...gesture}
    />
  )
}

export function WarpMarkers({
  clip,
  bpm,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, bpm)
  const markers = settings.warpMarkers ?? []
  const replace = (warpMarkers: readonly AudioWarpMarker[]) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, warpMarkers } })
  return (
    <section className="audio-detail-parameter-column" aria-label={t("detailAudio.warpMarkers")}>
      <h3>{t("detailAudio.warpMarkers")}</h3>
      <Button
        size="control"
        variant="ghost"
        disabled={!settings.warp || markers.length >= 256}
        onClick={() => {
          const last = markers.at(-1)
          replace([
            ...markers,
            {
              id: crypto.randomUUID(),
              sourceBar: (last?.sourceBar ?? 0) + 1,
              targetBar: (last?.targetBar ?? 0) + 1,
            },
          ])
        }}
      >
        {t("detailAudio.addWarpMarker")}
      </Button>
      {markers.map((marker, index) => (
        <div key={marker.id} className="gap-control-gap flex flex-col">
          <span>
            {t("detailAudio.warpMarker")} {index + 1}
          </span>
          <MarkerValue
            clip={clip}
            bpm={bpm}
            index={index}
            field="sourceBar"
            label={`${t("detailAudio.warpSource")} ${index + 1}`}
          />
          <MarkerValue
            clip={clip}
            bpm={bpm}
            index={index}
            field="targetBar"
            label={`${t("detailAudio.warpTarget")} ${index + 1}`}
          />
          <Button
            size="control"
            variant="ghost"
            disabled={!settings.warp}
            aria-label={`${t("detailAudio.removeWarpMarker")} ${index + 1}`}
            onClick={() => replace(markers.filter((_, item) => item !== index))}
          >
            {t("detailAudio.removeWarpMarker")}
          </Button>
        </div>
      ))}
    </section>
  )
}
