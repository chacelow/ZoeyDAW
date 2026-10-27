import { isAudioClipSettings } from "./audio-editor"
import { isMidiNotes } from "./patterns"
import type { Clip, ClipContent, Track } from "./types"

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === "string"
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
const positive = (value: unknown): value is number => number(value) && value > 0
function isClipData(v: unknown): v is ClipContent {
  if (
    !record(v) ||
    !text(v.id) ||
    !positive(v.lengthBars) ||
    (v.sourceOffsetBars !== undefined && !number(v.sourceOffsetBars)) ||
    (v.label !== undefined && !text(v.label)) ||
    (v.color !== undefined && !text(v.color)) ||
    (v.mute !== undefined && typeof v.mute !== "boolean")
  ) {
    return false
  }
  const sourceOffset = v.sourceOffsetBars ?? 0
  if (!number(sourceOffset) || !number(sourceOffset + v.lengthBars)) {
    return false
  }
  if (v.kind === "audio") {
    const fadeIn = v.fadeInBars ?? 0
    const fadeOut = v.fadeOutBars ?? 0
    const inOffset = v.fadeInOffsetBars ?? 0
    const outOffset = v.fadeOutOffsetBars ?? 0
    return (
      (v.sourceId === null || (text(v.sourceId) && v.sourceId.length > 0)) &&
      number(v.gainDb) &&
      (v.audioSettings === undefined || isAudioClipSettings(v.audioSettings)) &&
      (v.sourceTempo === undefined ||
        (v.sourceTempo === "unknown" &&
          record(v.audioSettings) &&
          v.audioSettings.warp === false)) &&
      number(fadeIn) &&
      (v.fadeInBars === undefined || number(v.fadeInBars)) &&
      fadeIn >= 0 &&
      number(fadeOut) &&
      (v.fadeOutBars === undefined || number(v.fadeOutBars)) &&
      fadeOut >= 0 &&
      number(inOffset) &&
      (v.fadeInOffsetBars === undefined || number(v.fadeInOffsetBars)) &&
      inOffset >= 0 &&
      number(outOffset) &&
      (v.fadeOutOffsetBars === undefined || number(v.fadeOutOffsetBars)) &&
      outOffset >= 0 &&
      (v.fadeInCurve === undefined ||
        (number(v.fadeInCurve) && v.fadeInCurve >= -1 && v.fadeInCurve <= 1)) &&
      (v.fadeOutCurve === undefined ||
        (number(v.fadeOutCurve) && v.fadeOutCurve >= -1 && v.fadeOutCurve <= 1)) &&
      (v.fadeInCurvePosition === undefined ||
        (number(v.fadeInCurvePosition) &&
          v.fadeInCurvePosition >= 0.1 &&
          v.fadeInCurvePosition <= 0.9)) &&
      (v.fadeOutCurvePosition === undefined ||
        (number(v.fadeOutCurvePosition) &&
          v.fadeOutCurvePosition >= 0.1 &&
          v.fadeOutCurvePosition <= 0.9)) &&
      inOffset + fadeIn <= v.lengthBars &&
      outOffset + fadeOut <= v.lengthBars &&
      inOffset + fadeIn + outOffset + fadeOut <=
        v.lengthBars + Number.EPSILON * Math.max(1, v.lengthBars) &&
      (v.waveformPeaks === undefined ||
        (Array.isArray(v.waveformPeaks) &&
          v.waveformPeaks.every(peak => number(peak) && peak >= 0 && peak <= 1)))
    )
  }
  return v.kind === "pattern"
    ? text(v.patternId) && v.patternId.length > 0 && !("steps" in v)
    : v.kind === "midi" &&
        (v.loopBars === undefined || positive(v.loopBars)) &&
        isMidiNotes(v.notes)
}

export function isClipContent(value: unknown): value is ClipContent {
  return isClipData(value) && !("startBar" in value)
}

export function isClip(value: unknown): value is Clip {
  return (
    isClipData(value) &&
    "startBar" in value &&
    positive(value.startBar) &&
    number(value.startBar + value.lengthBars)
  )
}

export function serializeClip(clip: Clip): Clip
export function serializeClip(clip: ClipContent): ClipContent
export function serializeClip(clip: ClipContent): ClipContent {
  const base = {
    id: clip.id,
    kind: clip.kind,
    ...("startBar" in clip && typeof clip.startBar === "number" ? { startBar: clip.startBar } : {}),
    lengthBars: clip.lengthBars,
    ...(clip.sourceOffsetBars !== undefined && { sourceOffsetBars: clip.sourceOffsetBars }),
    ...(clip.label !== undefined && { label: clip.label }),
    ...(clip.color !== undefined && { color: clip.color }),
    ...(clip.mute === true && { mute: true }),
  }
  switch (clip.kind) {
    case "audio": {
      return {
        ...base,
        kind: "audio",
        sourceId: clip.sourceId,
        gainDb: clip.gainDb,
        sourceTempo: clip.sourceTempo,
        ...(clip.audioSettings === undefined
          ? {}
          : { audioSettings: structuredClone(clip.audioSettings) }),
        ...(clip.fadeInBars !== undefined && { fadeInBars: clip.fadeInBars }),
        ...(clip.fadeOutBars !== undefined && { fadeOutBars: clip.fadeOutBars }),
        ...(clip.fadeInOffsetBars !== undefined && { fadeInOffsetBars: clip.fadeInOffsetBars }),
        ...(clip.fadeOutOffsetBars !== undefined && { fadeOutOffsetBars: clip.fadeOutOffsetBars }),
        ...(clip.fadeInCurve !== undefined && { fadeInCurve: clip.fadeInCurve }),
        ...(clip.fadeOutCurve !== undefined && { fadeOutCurve: clip.fadeOutCurve }),
        ...(clip.fadeInCurvePosition !== undefined && {
          fadeInCurvePosition: clip.fadeInCurvePosition,
        }),
        ...(clip.fadeOutCurvePosition !== undefined && {
          fadeOutCurvePosition: clip.fadeOutCurvePosition,
        }),
      }
    }
    case "midi": {
      return {
        ...base,
        kind: "midi",
        ...(clip.loopBars !== undefined && { loopBars: clip.loopBars }),
        notes: clip.notes.map(note => {
          return {
            pitch: note.pitch,
            startBeat: note.startBeat,
            lengthBeats: note.lengthBeats,
            velocity: note.velocity,
            ...(note.id === undefined ? {} : { id: note.id }),
          }
        }),
      }
    }
    case "pattern": {
      return {
        ...base,
        kind: "pattern",
        patternId: clip.patternId,
      }
    }
  }
}

export type ClipLocation =
  | { kind: "arrangement"; track: Track; clip: Clip }
  | { kind: "launcher"; track: Track; sceneId: string; clip: ClipContent }

export function locateClip(tracks: readonly Track[], id: string | null): ClipLocation | null {
  if (id === null) return null
  for (const track of tracks) {
    const arranged = track.clips.find(clip => clip.id === id)
    if (arranged) return { kind: "arrangement", track, clip: arranged }
    const slot = track.clipSlots?.find(slot => slot.clip.id === id)
    if (slot) return { kind: "launcher", track, sceneId: slot.sceneId, clip: slot.clip }
  }
  return null
}

export function* clipContents(track: Track): IterableIterator<ClipContent> {
  yield* track.clips
  for (const slot of track.clipSlots ?? []) yield slot.clip
}
