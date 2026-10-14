import { useTranslation } from "@zoeymind/i18n"
import { DragPadNumber, DragPadToggle, DropdownButton } from "@zoeymind/ui"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import {
  AUDIO_WARP_MODES,
  audioSourceWindow,
  audioLoopWindow,
  getAudioClipSettings,
} from "@/pages/project/model/audio-editor"
import { MusicalNumber } from "./MusicalNumber"
import type { AudioClipSettings } from "@/pages/project/model/audio-editor"
import type { AudioClip } from "@/pages/project/model/types"

type ClipField = "gainDb" | "fadeInBars" | "fadeOutBars"
type SettingField =
  | "sourceBpm"
  | "transpose"
  | "detune"
  | "loopStartBars"
  | "loopLengthBars"
  | "startMarkerBars"
  | "endMarkerBars"

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

function SettingNumber({
  clip,
  bpm,
  field,
  label,
  unit,
}: {
  readonly clip: AudioClip
  readonly bpm: number
  readonly field: SettingField
  readonly label: string
  readonly unit: string
}) {
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  const settings = getAudioClipSettings(clip, bpm)
  const isLoopField = field === "loopStartBars" || field === "loopLengthBars"
  const gesture = useProjectEditGesture((value: number) => {
    if (field === "startMarkerBars" || field === "endMarkerBars") {
      const patch = audioSourceWindow(
        clip,
        field === "startMarkerBars" ? value : settings.startMarkerBars,
        field === "endMarkerBars" ? value : settings.endMarkerBars,
        bpm
      )
      if (patch) projectActions.updateClip(clip.id, patch)
      return
    }
    const audioSettings = isLoopField
      ? audioLoopWindow(
          settings,
          field === "loopStartBars" ? value : settings.loopStartBars,
          field === "loopLengthBars" ? value : settings.loopLengthBars
        )
      : { ...settings, [field]: value }
    projectActions.updateClip(clip.id, { audioSettings })
  })
  if (
    field === "loopStartBars" ||
    field === "loopLengthBars" ||
    field === "startMarkerBars" ||
    field === "endMarkerBars"
  ) {
    return (
      <MusicalNumber
        value={settings[field]}
        min={field === "endMarkerBars" ? settings.startMarkerBars : 0}
        max={field === "startMarkerBars" ? settings.endMarkerBars : Number.MAX_SAFE_INTEGER}
        label={label}
        numerator={numerator}
        denominator={denominator}
        isValid={
          field === "startMarkerBars"
            ? value => value < settings.endMarkerBars
            : field === "endMarkerBars"
              ? value => value > settings.startMarkerBars
              : field === "loopLengthBars"
                ? value => value > 0
                : undefined
        }
        kind={field === "loopLengthBars" ? "duration" : "position"}
        defaultValue={
          field === "loopLengthBars"
            ? clip.lengthBars
            : field === "endMarkerBars"
              ? Math.max(0, clip.sourceOffsetBars ?? 0) + clip.lengthBars
              : Math.max(0, clip.sourceOffsetBars ?? 0)
        }
        gesture={gesture}
      />
    )
  }
  return (
    <label className="audio-detail-field">
      <span>{label}</span>
      <DragPadNumber
        size="compact"
        label={label}
        value={settings[field]}
        min={field === "sourceBpm" ? 1 : field === "transpose" ? -48 : -50}
        max={field === "sourceBpm" ? 999 : field === "transpose" ? 48 : 50}
        step={field === "sourceBpm" ? 0.01 : 1}
        defaultValue={field === "sourceBpm" ? bpm : 0}
        format={value => `${value.toFixed(field === "sourceBpm" ? 2 : 0)}${unit ? ` ${unit}` : ""}`}
        {...gesture}
      />
    </label>
  )
}

export function AudioParameters({ clip, bpm }: { readonly clip: AudioClip; readonly bpm: number }) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, bpm)
  const changeSettings = (patch: Partial<AudioClipSettings>) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, ...patch } })
  return (
    <aside className="audio-detail-parameters" aria-label={t("detailAudio.title")}>
      <section className="audio-detail-parameter-column">
        <h3>{t("detailAudio.source")}</h3>
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="startMarkerBars"
          label={t("detailAudio.start")}
          unit=""
        />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="endMarkerBars"
          label={t("detailAudio.end")}
          unit=""
        />
        <DragPadToggle
          size="compact"
          label={t("detailAudio.loop")}
          value={settings.loop}
          labelOn={t("detailAudio.loop")}
          labelOff={t("detailAudio.loop")}
          onChange={loop => changeSettings({ loop })}
        />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="loopStartBars"
          label={t("detailAudio.loopPosition")}
          unit={t("detailAudio.bars")}
        />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="loopLengthBars"
          label={t("detailAudio.loopLength")}
          unit={t("detailAudio.bars")}
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
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="sourceBpm"
          label={t("detailAudio.sourceBpm")}
          unit=""
        />
        <ClipNumber clip={clip} field="gainDb" label={t("detailAudio.gain")} />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="transpose"
          label={t("detailAudio.transpose")}
          unit={t("detailAudio.semitones")}
        />
        <SettingNumber
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
    </aside>
  )
}
