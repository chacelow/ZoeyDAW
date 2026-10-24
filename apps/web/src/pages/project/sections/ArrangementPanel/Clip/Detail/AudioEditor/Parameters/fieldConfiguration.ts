import type { AudioClipSettings, AudioMusicalValueKind } from "@zoeydaw/project-core/audio-editor"
import type { AudioClip } from "@zoeydaw/project-core/types"

export type SourceMarkerField = keyof Pick<AudioClipSettings, "startMarkerBars" | "endMarkerBars">
export type LoopField = keyof Pick<AudioClipSettings, "loopStartBars" | "loopLengthBars">
export type SampleSettingField = keyof Pick<AudioClipSettings, "sourceBpm" | "transpose" | "detune">

type MusicalFieldContext = {
  readonly clip: Pick<AudioClip, "sourceOffsetBars" | "lengthBars">
  readonly settings: AudioClipSettings
}

type MusicalFieldConfiguration = {
  readonly min: number
  readonly max: number
  readonly defaultValue: number
  readonly kind: AudioMusicalValueKind
  readonly isValid?: (value: number) => boolean
}

type MusicalFieldConfigurationFactory = (context: MusicalFieldContext) => MusicalFieldConfiguration

export const sourceMarkerFields: Record<SourceMarkerField, MusicalFieldConfigurationFactory> = {
  startMarkerBars: ({ clip, settings }) => ({
    min: 0,
    max: settings.endMarkerBars,
    defaultValue: Math.max(0, clip.sourceOffsetBars ?? 0),
    kind: "position",
    isValid: value => value < settings.endMarkerBars,
  }),
  endMarkerBars: ({ clip, settings }) => ({
    min: settings.startMarkerBars,
    max: Number.MAX_SAFE_INTEGER,
    defaultValue: Math.max(0, clip.sourceOffsetBars ?? 0) + clip.lengthBars,
    kind: "position",
    isValid: value => value > settings.startMarkerBars,
  }),
}

export const loopFields: Record<LoopField, MusicalFieldConfigurationFactory> = {
  loopStartBars: ({ clip }) => ({
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    defaultValue: Math.max(0, clip.sourceOffsetBars ?? 0),
    kind: "position",
  }),
  loopLengthBars: ({ clip }) => ({
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    defaultValue: clip.lengthBars,
    kind: "duration",
    isValid: value => value > 0,
  }),
}

type SampleFieldConfiguration = {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly decimalPlaces: number
  readonly defaultValue: (bpm: number) => number
}

export const sampleSettingFields: Record<SampleSettingField, SampleFieldConfiguration> = {
  sourceBpm: {
    min: 1,
    max: 999,
    step: 0.01,
    decimalPlaces: 2,
    defaultValue: bpm => bpm,
  },
  transpose: {
    min: -48,
    max: 48,
    step: 1,
    decimalPlaces: 0,
    defaultValue: () => 0,
  },
  detune: {
    min: -50,
    max: 50,
    step: 1,
    decimalPlaces: 0,
    defaultValue: () => 0,
  },
}
