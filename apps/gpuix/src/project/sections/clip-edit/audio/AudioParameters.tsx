import { useRef } from "react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import {
  AUDIO_WARP_MODES,
  audioLoopWindow,
  audioSourceWindow,
  formatAudioMusicalValue,
  getAudioClipSettings,
  parseAudioMusicalValue,
} from "@/project/model/audio-editor"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { DragPadNumber, DragPadToggle, DropdownButton, ScrollArea } from "@/ui/controls"
import type { AudioClipSettings, AudioMusicalValueKind } from "@/project/model/audio-editor"
import type { AudioClip } from "@/project/model/types"
import type { ReactNode } from "react"
import type { AudioEditorLabels } from "../labels"

type MusicalField = "startMarkerBars" | "endMarkerBars" | "loopStartBars" | "loopLengthBars"
type NumberField = "sourceBpm" | "transpose" | "detune"

const NUMBER_FIELDS: Readonly<
  Record<NumberField, { min: number; max: number; step: number; digits: number }>
> = {
  sourceBpm: { min: 1, max: 999, step: 0.01, digits: 2 },
  transpose: { min: -48, max: 48, step: 1, digits: 0 },
  detune: { min: -50, max: 50, step: 1, digits: 0 },
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const theme = useTheme()
  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.control["--spacing-control-gap"],
      })}
    >
      <text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: theme.control["--text-control-track"],
        }}
      >
        {label}
      </text>
      {children}
    </div>
  )
}

/** Bars.beats.sixteenths position or duration; dragging steps one sixteenth, typing parses Live syntax. */
function MusicalNumber({
  clip,
  bpm,
  field,
  label,
}: {
  readonly clip: AudioClip
  readonly bpm: number
  readonly field: MusicalField
  readonly label: string
}) {
  const { numerator, denominator } = useProjectState(state => state.document.transport)
  const settings = getAudioClipSettings(clip, bpm)
  const kind: AudioMusicalValueKind = field === "loopLengthBars" ? "duration" : "position"
  const min = field === "endMarkerBars" ? settings.startMarkerBars : 0
  const max = field === "startMarkerBars" ? settings.endMarkerBars : Number.MAX_SAFE_INTEGER
  // Bounds and the interval check are frozen at gesture start, so live previews cannot move them.
  const frozen = useRef({
    min,
    max,
    startMarker: settings.startMarkerBars,
    endMarker: settings.endMarkerBars,
  })
  const valid = useRef(true)
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
    projectActions.updateClip(clip.id, {
      audioSettings: audioLoopWindow(
        settings,
        field === "loopStartBars" ? value : settings.loopStartBars,
        field === "loopLengthBars" ? value : settings.loopLengthBars
      ),
    })
  })
  const format = (value: number) => formatAudioMusicalValue(value, numerator, denominator, kind)
  return (
    <Field label={label}>
      <DragPadNumber
        testId={`audio-${field}`}
        label={label}
        value={settings[field]}
        min={min}
        max={max}
        step={denominator / (numerator * 16)}
        hideIcon
        defaultValue={
          field === "loopLengthBars"
            ? clip.lengthBars
            : field === "endMarkerBars"
              ? Math.max(0, clip.sourceOffsetBars ?? 0) + clip.lengthBars
              : Math.max(0, clip.sourceOffsetBars ?? 0)
        }
        format={format}
        widthSamples={[format(999.9375)]}
        parse={raw => {
          const bounds = frozen.current
          let parsed = parseAudioMusicalValue(
            raw,
            numerator,
            denominator,
            kind,
            bounds.min,
            bounds.max
          )
          if (
            (field === "startMarkerBars" && !(parsed < bounds.endMarker)) ||
            (field === "endMarkerBars" && !(parsed > bounds.startMarker)) ||
            (field === "loopLengthBars" && !(parsed > 0))
          )
            parsed = Number.NaN
          valid.current = Number.isFinite(parsed)
          return parsed
        }}
        onGestureStart={() => {
          valid.current = true
          frozen.current = {
            min,
            max,
            startMarker: settings.startMarkerBars,
            endMarker: settings.endMarkerBars,
          }
          gesture.onGestureStart()
        }}
        onChange={gesture.onChange}
        onGestureEnd={() => (valid.current ? gesture.onGestureEnd() : gesture.onGestureCancel())}
        onGestureCancel={gesture.onGestureCancel}
      />
    </Field>
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
  readonly field: NumberField
  readonly label: string
  readonly unit: string
}) {
  const settings = getAudioClipSettings(clip, bpm)
  const spec = NUMBER_FIELDS[field]
  const gesture = useProjectEditGesture((value: number) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, [field]: value } })
  )
  const format = (value: number) => `${value.toFixed(spec.digits)}${unit ? ` ${unit}` : ""}`
  return (
    <Field label={label}>
      <DragPadNumber
        testId={`audio-${field}`}
        label={label}
        value={settings[field]}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        defaultValue={field === "sourceBpm" ? bpm : 0}
        hideIcon
        format={format}
        {...gesture}
      />
    </Field>
  )
}

function ClipNumber({
  clip,
  field,
  label,
}: {
  readonly clip: AudioClip
  readonly field: "gainDb" | "fadeInBars" | "fadeOutBars"
  readonly label: string
}) {
  const fadeRoom = Math.max(
    0,
    clip.lengthBars -
      (clip.fadeInOffsetBars ?? 0) -
      (clip.fadeOutOffsetBars ?? 0) -
      (field === "fadeInBars" ? (clip.fadeOutBars ?? 0) : (clip.fadeInBars ?? 0))
  )
  const gesture = useProjectEditGesture((value: number) =>
    projectActions.updateClip(clip.id, { [field]: value })
  )
  const gain = field === "gainDb"
  return (
    <Field label={label}>
      <DragPadNumber
        testId={`audio-${field}`}
        label={label}
        value={clip[field] ?? 0}
        min={gain ? -60 : 0}
        max={gain ? 24 : fadeRoom}
        step={gain ? 0.1 : 1 / 64}
        defaultValue={0}
        hideIcon
        format={value => (gain ? `${value.toFixed(1)} dB` : value.toFixed(3))}
        widthSamples={gain ? ["-60.0 dB"] : ["1024.000"]}
        {...gesture}
      />
    </Field>
  )
}

/**
Two compact columns like Live's Clip box: source window (Start/End, Loop, fades) and Sample
(Warp, mode, tempo, gain, pitch, Reverse). Every number is a shared DragPad with a stable width.
*/
export function AudioParameters({
  clip,
  bpm,
  labels,
}: {
  readonly clip: AudioClip
  readonly bpm: number
  readonly labels: AudioEditorLabels
}) {
  const theme = useTheme()
  const settings = getAudioClipSettings(clip, bpm)
  const change = (patch: Partial<AudioClipSettings>) =>
    projectActions.updateClip(clip.id, { audioSettings: { ...settings, ...patch } })
  const gap = theme.control["--spacing-control-gap"]
  const column = sx({
    display: "flex",
    flexDirection: "column",
    gap,
    minWidth: 0,
    padding: theme.control["--spacing-control-track-gap"],
  })
  const heading = {
    color: theme.colors.mutedForeground,
    fontSize: theme.control["--text-control-track"],
  }
  return (
    <ScrollArea
      testId="audio-parameters"
      orientation="vertical"
      height="100%"
      aria-label={labels.title}
      style={sx({
        display: "flex",
        flexDirection: "row",
        flexShrink: 0,
        borderRightWidth: theme.design.editor.dividerStrokeWidth,
        borderColor: theme.colors.arrangementLine,
      })}
    >
      <div style={column}>
        <text style={heading}>{labels.source}</text>
        <MusicalNumber clip={clip} bpm={bpm} field="startMarkerBars" label={labels.start} />
        <MusicalNumber clip={clip} bpm={bpm} field="endMarkerBars" label={labels.end} />
        <DragPadToggle
          testId="audio-loop"
          label={labels.loop}
          labelOn={labels.loop}
          labelOff={labels.loop}
          value={settings.loop}
          onChange={loop => change({ loop })}
        />
        <MusicalNumber clip={clip} bpm={bpm} field="loopStartBars" label={labels.loopPosition} />
        <MusicalNumber clip={clip} bpm={bpm} field="loopLengthBars" label={labels.loopLength} />
        <ClipNumber clip={clip} field="fadeInBars" label={labels.fadeIn} />
        <ClipNumber clip={clip} field="fadeOutBars" label={labels.fadeOut} />
      </div>
      <div
        style={sx(column, {
          borderLeftWidth: theme.design.editor.dividerStrokeWidth,
          borderColor: theme.colors.arrangementLine,
        })}
      >
        <text style={heading}>{labels.sample}</text>
        <DragPadToggle
          testId="audio-warp"
          label={labels.warp}
          labelOn={labels.warp}
          labelOff={labels.warp}
          value={settings.warp}
          onChange={warp => change({ warp })}
        />
        <DropdownButton
          testId="audio-warp-mode"
          label={labels.warpMode}
          value={settings.warpMode}
          disabled={!settings.warp}
          side="top"
          matchTriggerWidth={false}
          items={AUDIO_WARP_MODES.map(mode => ({ id: mode, label: labels.modes[mode] }))}
          onChange={warpMode => change({ warpMode })}
        />
        <SettingNumber clip={clip} bpm={bpm} field="sourceBpm" label={labels.sourceBpm} unit="" />
        <ClipNumber clip={clip} field="gainDb" label={labels.gain} />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="transpose"
          label={labels.transpose}
          unit={labels.semitones}
        />
        <SettingNumber
          clip={clip}
          bpm={bpm}
          field="detune"
          label={labels.detune}
          unit={labels.cents}
        />
        <DragPadToggle
          testId="audio-reverse"
          label={labels.reverse}
          labelOn={labels.reverse}
          labelOff={labels.reverse}
          value={settings.reverse}
          onChange={reverse => change({ reverse })}
        />
      </div>
    </ScrollArea>
  )
}
