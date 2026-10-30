import { useTranslation } from "@zoeymind/i18n"
import { Button, DragPadNumber, DragPadToggle, DropdownButton } from "@zoeymind/ui"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { AUDIO_WARP_MODES, getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { SourceMarkerNumber } from "./SourceMarkerNumber"
import { LoopNumber } from "./LoopNumber"
import { SampleSettingNumber } from "./SampleSettingNumber"
import { AudioControl } from "./AudioControl"
import { AudioSection } from "./AudioSection"
import { ClipProperties } from "@/pages/project/sections/ArrangementPanel/Clip/Detail/ClipProperties"
import { ClipCardHeader } from "@/pages/project/sections/ArrangementPanel/Clip/Detail/ClipCardHeader"
import type { AudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { AudioClipContent, Clip } from "@zoeydaw/project-core/types"
import { WarpMarkers } from "../WarpMarkers"
import type { AudioInspectorMode } from "../useAudioInspectorMode"

type ClipField = "gainDb" | "fadeInBars" | "fadeOutBars"

function ClipNumber({
  clip,
  field,
  label,
}: {
  readonly clip: AudioClipContent
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
    <AudioControl label={label}>
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
    </AudioControl>
  )
}

function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-[length:var(--text-control)] font-medium">
      {children}
    </h3>
  )
}

function WideTabs({
  clipLabel,
  audioLabel,
}: {
  readonly clipLabel: string
  readonly audioLabel: string
}) {
  return (
    <div className="border-border h-control-h flex shrink-0 border-b" role="tablist">
      <Button
        type="button"
        size="control"
        variant="secondary"
        className="flex-1 rounded-none"
        role="tab"
        aria-selected="true"
      >
        {clipLabel}
      </Button>
      <Button
        type="button"
        size="control"
        variant="ghost"
        className="flex-1 rounded-none"
        role="tab"
        aria-selected="false"
      >
        {audioLabel}
      </Button>
    </div>
  )
}

function ClipContent({
  clip,
  bpm,
  t,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly t: (key: string) => string
}) {
  const numerator = useProjectState(state => state.document.transport.numerator)
  const denominator = useProjectState(state => state.document.transport.denominator)
  return (
    <section className="gap-control-gap p-control-gap flex min-w-0 flex-col">
      <SectionTitle>{t("detailAudio.source")}</SectionTitle>
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
      <AudioControl variant="display" label={t("detailAudio.signature")}>
        <span className="bg-muted/45 border-border text-foreground min-h-control-h px-control-pad-x flex items-center border">
          {numerator}/{denominator}
        </span>
      </AudioControl>
      <ClipNumber clip={clip} field="fadeInBars" label={t("detailAudio.fadeIn")} />
      <ClipNumber clip={clip} field="fadeOutBars" label={t("detailAudio.fadeOut")} />
      <p className="text-muted-foreground mt-control-gap text-[length:var(--text-control)] leading-relaxed">
        {t("detailAudio.sourceHelp")}
      </p>
    </section>
  )
}

function AudioContent({
  clip,
  bpm,
  settings,
  changeSettings,
  t,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly settings: AudioClipSettings
  readonly changeSettings: (patch: Partial<AudioClipSettings>) => void
  readonly t: (key: string) => string
}) {
  return (
    <section className="gap-control-gap p-control-gap flex min-w-0 flex-col">
      <SectionTitle>{t("detailAudio.audioSection")}</SectionTitle>
      <AudioControl variant="toggle" label={t("detailAudio.warp")}>
        <DragPadToggle
          size="compact"
          label={t("detailAudio.warp")}
          value={settings.warp}
          labelOn={t("detailAudio.warp")}
          labelOff={t("detailAudio.warp")}
          onChange={warp => changeSettings({ warp })}
        />
      </AudioControl>
      <AudioControl variant="select" label={t("detailAudio.warpMode")}>
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
      </AudioControl>
      <SampleSettingNumber
        clip={clip}
        bpm={bpm}
        field="sourceBpm"
        label={t("detailAudio.sourceBpm")}
        unit=""
      />
      <AudioControl variant="toggle" label={t("detailAudio.reverse")}>
        <DragPadToggle
          size="compact"
          label={t("detailAudio.reverse")}
          value={settings.reverse}
          labelOn={t("detailAudio.reverse")}
          labelOff={t("detailAudio.reverse")}
          onChange={reverse => changeSettings({ reverse })}
        />
      </AudioControl>
      <WarpMarkers clip={clip} bpm={bpm} />
    </section>
  )
}

function TransformContent({
  clip,
  bpm,
  t,
}: {
  readonly clip: AudioClipContent
  readonly bpm: number
  readonly t: (key: string) => string
}) {
  return (
    <section className="gap-control-gap p-control-gap flex min-w-0 flex-col border-t">
      <SectionTitle>{t("detailAudio.transform")}</SectionTitle>
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
    </section>
  )
}

export function AudioParameters({
  clip,
  color,
  placementClip,
  bpm,
  mode,
}: {
  readonly clip: AudioClipContent
  readonly color: string
  readonly placementClip?: Clip
  readonly bpm: number
  readonly mode: AudioInspectorMode
}) {
  const { t } = useTranslation()
  const settings = getAudioClipSettings(clip, bpm)
  const changeSettings = (patch: Partial<AudioClipSettings>) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, ...patch } })
  return (
    <aside
      className="border-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b"
      aria-label={t("detailAudio.title")}
    >
      <ClipCardHeader clip={clip} color={color} />
      {mode === "wide" ? (
        <WideTabs
          clipLabel={t("detailAudio.clipSection")}
          audioLabel={t("detailAudio.audioSection")}
        />
      ) : null}
      {mode === "compact" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <AudioSection title={t("detailAudio.clipSection")} defaultOpen>
            <ClipProperties clip={clip} placementClip={placementClip} />
            <ClipContent clip={clip} bpm={bpm} t={t} />
          </AudioSection>
          <AudioSection title={t("detailAudio.audioSection")} defaultOpen>
            <AudioContent
              clip={clip}
              bpm={bpm}
              settings={settings}
              changeSettings={changeSettings}
              t={t}
            />
          </AudioSection>
          <AudioSection title={t("detailAudio.transform")} defaultOpen>
            <TransformContent clip={clip} bpm={bpm} t={t} />
          </AudioSection>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 overflow-auto">
          <div className="min-w-0 overflow-auto border-r">
            <ClipProperties clip={clip} placementClip={placementClip} />
            <ClipContent clip={clip} bpm={bpm} t={t} />
          </div>
          <div className="min-w-0 overflow-auto">
            <AudioContent
              clip={clip}
              bpm={bpm}
              settings={settings}
              changeSettings={changeSettings}
              t={t}
            />
            <TransformContent clip={clip} bpm={bpm} t={t} />
          </div>
        </div>
      )}
    </aside>
  )
}
