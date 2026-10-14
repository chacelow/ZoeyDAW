import type { AudioClip } from "../types"

export const AUDIO_WARP_MODES = [
  "beats",
  "tones",
  "texture",
  "repitch",
  "complex",
  "complex-pro",
] as const

export interface AudioClipSettings {
  warp: boolean
  warpMode: (typeof AUDIO_WARP_MODES)[number]
  sourceBpm: number
  transpose: number
  detune: number
  reverse: boolean
  loop: boolean
  loopStartBars: number
  loopLengthBars: number
  startMarkerBars: number
  endMarkerBars: number
}

const AUDIO_SETTINGS_FIELDS = [
  "warp",
  "warpMode",
  "sourceBpm",
  "transpose",
  "detune",
  "reverse",
  "loop",
  "loopStartBars",
  "loopLengthBars",
  "startMarkerBars",
  "endMarkerBars",
] satisfies (keyof AudioClipSettings)[]

export function defaultAudioClipSettings(
  bpm: number,
  clip: Pick<AudioClip, "sourceOffsetBars" | "lengthBars">
): AudioClipSettings {
  return {
    warp: true,
    warpMode: "beats",
    sourceBpm: Number.isFinite(bpm) && bpm > 0 ? Math.min(999, bpm) : 120,
    transpose: 0,
    detune: 0,
    reverse: false,
    loop: true,
    loopStartBars: Math.max(0, clip.sourceOffsetBars ?? 0),
    loopLengthBars: clip.lengthBars,
    startMarkerBars: Math.max(0, clip.sourceOffsetBars ?? 0),
    endMarkerBars: Math.max(0, clip.sourceOffsetBars ?? 0) + clip.lengthBars,
  }
}

export function getAudioClipSettings(
  clip: Pick<AudioClip, "audioSettings" | "sourceOffsetBars" | "lengthBars">,
  bpm: number
): AudioClipSettings {
  return clip.audioSettings ?? defaultAudioClipSettings(bpm, clip)
}

export function isAudioClipSettings(value: unknown): value is AudioClipSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const fields = Object.keys(value)
  if (
    fields.length !== AUDIO_SETTINGS_FIELDS.length ||
    fields.some(field => !AUDIO_SETTINGS_FIELDS.some(known => known === field))
  )
    return false
  return (
    "warp" in value &&
    typeof value.warp === "boolean" &&
    "warpMode" in value &&
    AUDIO_WARP_MODES.some(mode => mode === value.warpMode) &&
    "sourceBpm" in value &&
    typeof value.sourceBpm === "number" &&
    Number.isFinite(value.sourceBpm) &&
    value.sourceBpm > 0 &&
    value.sourceBpm <= 999 &&
    "transpose" in value &&
    typeof value.transpose === "number" &&
    Number.isInteger(value.transpose) &&
    value.transpose >= -48 &&
    value.transpose <= 48 &&
    "detune" in value &&
    typeof value.detune === "number" &&
    Number.isInteger(value.detune) &&
    value.detune >= -50 &&
    value.detune <= 50 &&
    "reverse" in value &&
    typeof value.reverse === "boolean" &&
    "loop" in value &&
    typeof value.loop === "boolean" &&
    "loopStartBars" in value &&
    typeof value.loopStartBars === "number" &&
    Number.isFinite(value.loopStartBars) &&
    value.loopStartBars >= 0 &&
    "loopLengthBars" in value &&
    typeof value.loopLengthBars === "number" &&
    Number.isFinite(value.loopLengthBars) &&
    value.loopLengthBars > 0 &&
    Number.isFinite(value.loopStartBars + value.loopLengthBars) &&
    "startMarkerBars" in value &&
    typeof value.startMarkerBars === "number" &&
    Number.isFinite(value.startMarkerBars) &&
    value.startMarkerBars >= 0 &&
    "endMarkerBars" in value &&
    typeof value.endMarkerBars === "number" &&
    Number.isFinite(value.endMarkerBars) &&
    value.endMarkerBars > value.startMarkerBars
  )
}

/** Playback markers are independent of arrangement placement, retained preview and fades. */
export function audioSourceWindow(clip: AudioClip, start: number, end: number, bpm: number) {
  const settings = getAudioClipSettings(clip, bpm)
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) {
    return null
  }
  return { audioSettings: { ...settings, startMarkerBars: start, endMarkerBars: end } }
}

export function audioLoopWindow(
  settings: AudioClipSettings,
  start: number,
  length: number
): AudioClipSettings {
  const loopStartBars = Number.isFinite(start)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, start))
    : settings.loopStartBars
  const loopLengthBars = Number.isFinite(length)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(Number.MIN_VALUE, length))
    : settings.loopLengthBars
  return { ...settings, loopStartBars, loopLengthBars }
}
