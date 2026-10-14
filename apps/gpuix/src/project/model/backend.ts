import type { AutomationLane, MidiNote, TrackKind } from "./types"

export interface BackendClipBase {
  id: string
  startBar: number
  lengthBars: number
  sourceOffsetBars: number
}
export interface BackendAudioClip extends BackendClipBase {
  kind: "audio"
  sourceId: string | null
  gainDb: number
  fadeInBars: number
  fadeOutBars: number
  fadeInOffsetBars: number
  fadeOutOffsetBars: number
  fadeInCurve: number
  fadeOutCurve: number
  fadeInCurvePosition: number
  fadeOutCurvePosition: number
}
export interface BackendMidiClip extends BackendClipBase {
  kind: "midi"
  notes: readonly MidiNote[]
  loopBars: number
}
export interface BackendPatternClip extends BackendClipBase {
  kind: "pattern"
  steps: readonly boolean[]
}
export type BackendClip = BackendAudioClip | BackendMidiClip | BackendPatternClip
export interface BackendSource {
  id: string
  uri: string
}
export interface BackendTrack {
  id: string
  kind: TrackKind
  output: string
  input: string
  inputChannel: string | null
  outputChannel: string | null
  monitor: "in" | "auto" | "off"
  volumeDb: number
  pan: number
  mute: boolean
  solo: boolean
  armed: boolean
  sends: Readonly<Record<string, number>>
  returnPost: boolean
  cueOutput: string | null
  cueVolumeDb: number
  clips: readonly BackendClip[]
  automation: readonly AutomationLane[]
}

/**
Musical coordinates are one-based bars; MIDI beats retain the document's meter-beat convention.
*/
export interface BackendProject {
  bpm: number
  numerator: number
  denominator: number
  loop: { enabled: boolean; startBar: number; endBar: number }
  sources: readonly BackendSource[]
  tracks: readonly BackendTrack[]
}
export interface BackendControl {
  playing: boolean
  recording: boolean
  seekBar: number
  seekGeneration: number
  heldNotes: readonly number[]
  midiVelocity: number
}
export interface BackendState {
  project: BackendProject
  control: BackendControl
}
export type BackendStage = "open" | "commit" | "preview" | "cancel" | "transport" | "recover"
export interface BackendRequest {
  protocolVersion: 1
  sessionId: string
  sequence: number
  baseRevision: number
  revision: number
  stage: BackendStage
  editId: string | null
  state: BackendState
}
export type BackendFailureCode = "rejected" | "connection" | "protocol" | "disposed"
export type BackendResult =
  | { kind: "accepted"; sessionId: string; sequence: number; revision: number }
  | { kind: "rejected"; sessionId: string; sequence: number; code: BackendFailureCode }
export type BackendClock =
  | { kind: "musical"; bar: number; barsPerSecond: number }
  | { kind: "sample"; bar: number; barsPerSecond: number; frame: number; sampleRate: number }
export interface BackendTelemetry {
  sessionId: string
  /**
  Monotone telemetry sample sequence, independent from command sequence.
  */
  sequence: number
  appliedSequence: number
  clock: BackendClock
  playing: boolean
  recording: boolean
  /**
  Finite dBFS levels; providers encode silence at a finite floor.
  */
  levels: Readonly<Record<string, readonly [number, number]>>
  outputLatencyFrames: number | null
}

/**
Waveform envelopes for a clip-local musical range: one-based `startBar`/`endBar`, signed
`contentOffsetBars` wrapping like clip playback. Bar-to-frame conversion and looping happen in the
backend on the applied tempo. Layout is channel-major, then pixel-major `[min, max]`; stereo yields
`pixels * 4` floats, never PCM. Unknown sources and empty ranges yield zeros; no open backend yields
an empty array.
*/
export type PeakReader = (
  sourceId: string,
  startBar: number,
  endBar: number,
  pixels: number,
  contentOffsetBars: number
) => Float32Array

/**
Implementations atomically apply state, fence sessions/sequences, and never receive UI or PCM buffers.
*/
export interface ProjectBackend {
  apply: (request: BackendRequest) => BackendResult | Promise<BackendResult>
  subscribe: (listener: (telemetry: BackendTelemetry) => void) => () => void
  readPeaks: PeakReader
  dispose: () => void
}
export type ProjectBackendFactory = () => ProjectBackend
export interface ProjectRuntimeStatus {
  phase: "idle" | "opening" | "ready" | "pending" | "error"
  sessionId: string
  pending: number
  acceptedRevision: number
  error: BackendFailureCode | null
}
