/**
 * Domain types for the gpuix hardest-path prototype.
 *
 * Mirrors `apps/web/src/pages/project/model/types.ts`, scoped to what the
 * track column, Clip drag/resize, waveform and automation-curve slices
 * actually consume: no full `DocumentState`/`SessionState`/`ProjectState`
 * store machinery here. That is a separate architecture decision once the
 * prototype proves the rendering approach; this file is not it.
 *
 * Shared by every slice: do not redeclare `Track` or `Clip` in a feature
 * directory.
 */

export interface Position {
  bar: number
  beat: number
  sixteenth: number
}

export interface AutomationPoint {
  id: string
  bar: number
  value: number
  curve?: number
}

export interface AutomationLane {
  id: string
  parameter: "volume" | "pan"
  points: AutomationPoint[]
}

export interface ClipBase {
  id: string
  startBar: number
  lengthBars: number
  sourceOffsetBars?: number
  label?: string
  color?: string
}

export interface AudioClip extends ClipBase {
  kind: "audio"
  samplePath: string
  waveformPeaks?: number[]
  gainDb: number
  fadeInBars?: number
  fadeOutBars?: number
  fadeInOffsetBars?: number
  fadeOutOffsetBars?: number
  fadeInCurve?: number
  fadeOutCurve?: number
  fadeInCurvePosition?: number
  fadeOutCurvePosition?: number
}

export interface MidiNote {
  id?: string
  pitch: number
  startBeat: number
  lengthBeats: number
  velocity: number
}

export interface MidiClip extends ClipBase {
  kind: "midi"
  notes: MidiNote[]
  loopBars?: number
}

export interface PatternClip extends ClipBase {
  kind: "pattern"
  patternId: string
  steps?: boolean[]
}

export type Clip = AudioClip | MidiClip | PatternClip
export type TrackKind = "audio" | "midi" | "group" | "return" | "main"

const CLIP_KINDS_BY_TRACK: Record<TrackKind, readonly Clip["kind"][]> = {
  audio: ["audio"],
  midi: ["midi", "pattern"],
  group: [],
  return: [],
  main: [],
}

export function acceptsClip(trackKind: TrackKind, clipKind: Clip["kind"]): boolean {
  return CLIP_KINDS_BY_TRACK[trackKind].includes(clipKind)
}

export interface Track {
  id: string
  name: string
  kind: TrackKind
  color: string
  solo: boolean
  armed: boolean
  mute: boolean
  volumeDb: number
  pan: number
  heightPx: number
  collapsed?: boolean
  clips: Clip[]
  automation: AutomationLane[]
}
