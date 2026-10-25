import type { AutomationLane, MidiNote, TrackKind } from "./types"
import type { AudioClipSettings } from "./audio-editor"
import type { Device } from "./devices"
import type { MeterStore } from "./realtime/meter-store"

export interface BackendClipBase {
  id: string
  startBar: number
  lengthBars: number
  sourceOffsetBars: number
  /** A muted clip stays scheduled but produces no signal. */
  mute: boolean
}
export interface BackendAudioClip extends BackendClipBase {
  kind: "audio"
  sourceId: string | null
  gainDb: number
  audioSettings: AudioClipSettings
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
export type BackendClip = BackendAudioClip | BackendMidiClip
export interface BackendSource {
  id: string
  uri: string
  sha256: string
  frames: number
  sampleRate: number
  channels: number
}
export type BackendDevice = {
  [Kind in Device["kind"]]: Omit<Extract<Device, { kind: Kind }>, "collapsed">
}[Device["kind"]]
export interface BackendTrack {
  id: string
  kind: TrackKind
  output: string
  childTrackIds: readonly string[]
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
  devices: readonly BackendDevice[]
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
  metronome?: boolean
}
export interface BackendState {
  project: BackendProject
  control: BackendControl
}
export type BackendStage = "open" | "commit" | "preview" | "cancel" | "recover"
export interface BackendDocumentRequest {
  protocolVersion: 2
  sessionId: string
  sequence: number
  baseRevision: number
  revision: number
  stage: BackendStage
  editId: string | null
  controlGeneration: string
  state: BackendState
}
export interface BackendControlRequest {
  protocolVersion: 2
  sessionId: string
  sequence: number
  controlGeneration: string
  control: BackendControl
}
export interface BackendNote {
  trackId: string
  noteId: string
  pitch: number
  velocity: number
  on: boolean
  requestedSample?: string
}
export interface BackendNoteRequest {
  protocolVersion: 2
  sessionId: string
  sequence: number
  note: BackendNote
}
export type BackendNoteResult =
  | { kind: "accepted"; sessionId: string; sequence: number }
  | {
      kind: "rejected"
      sessionId: string
      sequence: number
      code: BackendFailureCode | "note-overrun"
    }
export type BackendFailureCode = "rejected" | "connection" | "protocol" | "disposed"
export type BackendResult =
  | {
      kind: "accepted"
      sessionId: string
      sequence: number
      revision: number
      controlGeneration: string
    }
  | {
      kind: "rejected"
      sessionId: string
      sequence: number
      code: BackendFailureCode | "superseded-open"
      controlGeneration: string
    }
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
  controlGeneration: string
  clock: BackendClock
  playing: boolean
  recording: boolean
}

/**
Implementations atomically apply state, fence sessions/sequences, and never receive UI or PCM buffers.
*/
export interface ProjectBackend {
  apply: (request: BackendDocumentRequest) => BackendResult | Promise<BackendResult>
  control: (request: BackendControlRequest) => BackendResult | Promise<BackendResult>
  note: (request: BackendNoteRequest) => BackendNoteResult | Promise<BackendNoteResult>
  allNotesOff: () => void | Promise<void>
  urgentStop?: () => Promise<void>
  subscribe: (listener: (telemetry: BackendTelemetry) => void) => () => void
  readMeters?: () => MeterStore | null
  dispose: () => void
}
export type ProjectBackendFactory = () => ProjectBackend
export interface ProjectRuntimeStatus {
  phase: "idle" | "opening" | "ready" | "pending" | "error"
  sessionId: string
  pending: number
  acceptedRevision: number
  error: BackendFailureCode | "note-overrun" | null
}
