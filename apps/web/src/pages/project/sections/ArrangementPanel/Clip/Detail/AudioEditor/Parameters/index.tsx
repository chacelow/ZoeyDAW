import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber, DragPadToggle, DropdownButton } from "@zoeymind/ui"
import { projectActions, useProjectEditGesture } from "@/pages/project/adapters"
import { AUDIO_WARP_MODES, getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { SourceMarkerNumber } from "./SourceMarkerNumber"
import { LoopNumber } from "./LoopNumber"
import { SampleSettingNumber } from "./SampleSettingNumber"
import { ClipCardHeader } from "@/pages/project/sections/ArrangementPanel/Clip/Detail/ClipCardHeader"
import type { AudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { AudioClip } from "@zoeydaw/project-core/types"

type ClipField = "gainDb" | "fadeInBars" | "fadeOutBars"

function ClipNumber({
  clip,
  field,
  label,
}: {
  readonly clip: AudioClip
  readonly field: ClipField
  readonly label: string
}) {
  const fadeAvailable = Math.max(
    0,
    clip.lengthBars -
      (clip.fadeInOffsetBars ?? 0) -
      (clip.fadeOutOffsetBars ?? 0) -
      (field === "fadeInBars" ? (clip.fadeOutBars ?? 0) : (clip.fadeInBars ?? 0))
  )
  const value = clip[field] ?? 0
  const min = field === "gainDb" ? -60 : 0
  const max = field === "gainDb" ? 24 : fadeAvailable
  const gesture = useProjectEditGesture((next: number) => {
    projectActions.updateClip(clip.id, { [field]: next })
  })
  return (
    <label className="audio-detail-field">
      <span>{label}</span>
      <DragPadNumber
        size="compact"
        label={label}
        value={value}
        min={min}
        max={max}
        step={field === "gainDb" ? 0.1 : 1 / 64}
        defaultValue={0}
        format={number => (field === "gainDb" ? `${number.toFixed(1)} dB` : number.toFixed(3))}
        {...gesture}
      />
    </label>
  )
}

export function AudioParameters({
  clip,
  color,
  bpm,
}: {
  readonly clip: AudioClip
  readonly color: string
  readonly bpm: number
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, bpm)
  const changeSettings = (patch: Partial<AudioClipSettings>) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, ...patch } })
  return (
    <aside className="audio-detail-parameters" aria-label={t("detailAudio.title")}>
      <ClipCardHeader clip={clip} color={color} />
      <div className="audio-detail-parameter-scroll">
        <section className="audio-detail-parameter-column">
          <h3>{t("detailAudio.source")}</h3>
          <SourceMarkerNumber
            clip={clip}
            bpm={bpm}
            field="startMarkerBars"
            label={t("detailAudio.start")}
          />
          <SourceMarkerNumber
            clip={clip}
            bpm={bpm}
            field="endMarkerBars"
            label={t("detailAudio.end")}
          />
          <DragPadToggle
            size="compact"
            label={t("detailAudio.loop")}
            value={settings.loop}
            labelOn={t("detailAudio.loop")}
            labelOff={t("detailAudio.loop")}
            onChange={loop => changeSettings({ loop })}
          />
          <LoopNumber
            clip={clip}
            bpm={bpm}
            field="loopStartBars"
            label={t("detailAudio.loopPosition")}
          />
          <LoopNumber
            clip={clip}
            bpm={bpm}
            field="loopLengthBars"
            label={t("detailAudio.loopLength")}
          />
          <ClipNumber clip={clip} field="fadeInBars" label={t("detailAudio.fadeIn")} />
          <ClipNumber clip={clip} field="fadeOutBars" label={t("detailAudio.fadeOut")} />
          <p className="audio-detail-help">{t("detailAudio.sourceHelp")}</p>
        </section>
        <section className="audio-detail-parameter-column">
          <h3>{t("detailAudio.sample")}</h3>
          <DragPadToggle
            size="compact"
            label={t("detailAudio.warp")}
            value={settings.warp}
            labelOn={t("detailAudio.warp")}
            labelOff={t("detailAudio.warp")}
            onChange={warp => changeSettings({ warp })}
          />
          <DropdownButton
            size="compact"
            label={t("detailAudio.warpMode")}
            value={settings.warpMode}
            disabled={!settings.warp}
            side="top"
            matchTriggerWidth={false}
            items={AUDIO_WARP_MODES.map(mode => ({
              id: mode,
              label: t(`detailAudio.modes.${mode}`),
            }))}
            onChange={warpMode => changeSettings({ warpMode })}
          />
          <SampleSettingNumber
            clip={clip}
            bpm={bpm}
            field="sourceBpm"
            label={t("detailAudio.sourceBpm")}
            unit=""
          />
          <ClipNumber clip={clip} field="gainDb" label={t("detailAudio.gain")} />
          <SampleSettingNumber
            clip={clip}
            bpm={bpm}
            field="transpose"
            label={t("detailAudio.transpose")}
            unit={t("detailAudio.semitones")}
          />
          <SampleSettingNumber
            clip={clip}
            bpm={bpm}
            field="detune"
            label={t("detailAudio.detune")}
            unit={t("detailAudio.cents")}
          />
          <DragPadToggle
            size="compact"
            label={t("detailAudio.reverse")}
            value={settings.reverse}
            labelOn={t("detailAudio.reverse")}
            labelOff={t("detailAudio.reverse")}
            onChange={reverse => changeSettings({ reverse })}
          />
        </section>
      </div>
    </aside>
  )
}
