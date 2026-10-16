import type { ProjectRuntimeStatus } from "./backend"
import type { GridSettings } from "./grid"
import type { AudioClipSettings } from "./audio-editor"
import type { Device } from "./devices"
import type { SnapshotErrorCode } from "./snapshot-error"

export const PATTERN_STEPS_PER_BAR = 16

export interface Position {
  bar: number
  beat: number
  sixteenth: number
}
export interface LoopRegion {
  enabled: boolean
  startBar: number
  endBar: number
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
  gainDb: number
  audioSettings?: AudioClipSettings
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
  input: string
  output: string
  clips: Clip[]
  inputChannel?: string
  outputChannel?: string
  cueOutput?: string
  cueVolumeDb?: number
  returnPost?: boolean
  sends?: Record<string, number>
  heightPx: number
  childTrackIds?: string[]
  collapsed?: boolean
  monitor: "in" | "auto" | "off"
  automation: AutomationLane[]
  devices?: Device[]
}
export interface Marker {
  id: string
  bar: number
  label: string
  color?: string
}
export interface DocumentState {
  name: string
  scaleRoot: string
  scaleMode: string
  groove: number
  transport: {
    bpm: number
    numerator: number
    denominator: number
    barLength: string
    loop: LoopRegion
  }
  tracks: Track[]
  markers: Marker[]
}
export interface WorkspaceState {
  pxPerBar: number
  scrollX: number
  scrollY: number
  snap: boolean
  grid: GridSettings
  follow: boolean
  automationMode: boolean
  drawMode: boolean
  computerKeyboard: boolean
  link: boolean
  metronome: boolean
}
export interface TimeSelection {
  startBar: number
  endBar: number
  trackIds: string[]
}
export interface ProjectEditToken {
  sessionId: string
  id: string
}

export type ProjectPreview =
  | { kind: "tracks"; token: ProjectEditToken; tracks: Track[] }
  | { kind: "markers"; token: ProjectEditToken; markers: Marker[] }
  | { kind: "loop"; token: ProjectEditToken; loop: LoopRegion }

export interface SessionState {
  editEpoch: string
  playing: boolean
  recording: boolean
  position: Position
  insertionPoint: { trackId: string | null; bar: number } | null
  selectedTrackIds: string[]
  trackSelectionSurface: "arrangement" | "header"
  selectedClipIds: string[]
  timeSelection: TimeSelection | null
  editingClipId: string | null
  clipEditorRequest: number
  levels: Record<string, [number, number]>
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  snapshotError: SnapshotErrorCode | null
  snapshotSaveBlocked: boolean
  preview: ProjectPreview | null
  backend: ProjectRuntimeStatus
  activeMidiNotes: number[]
  midiOctave: number
  midiVelocity: number
  drawModeOverride: boolean | null
  automationParameters: Record<string, AutomationLane["parameter"]>
}
export interface ProjectState {
  document: DocumentState
  workspace: WorkspaceState
  session: SessionState
}

export function positionToBar(position: Position, numerator: number): number {
  return position.bar + (position.beat - 1 + (position.sixteenth - 1) / 4) / numerator
}

export function visibleTracks(tracks: Track[]): Track[] {
  const hidden = new Set<string>()
  const byId = new Map(tracks.map(track => [track.id, track]))
  function hide(id: string) {
    if (hidden.has(id)) {
      return
    }
    hidden.add(id)
    byId.get(id)?.childTrackIds?.forEach(hide)
  }
  for (const track of tracks) {
    if (track.kind === "group" && track.collapsed) {
      track.childTrackIds?.forEach(hide)
    }
  }
  return tracks.filter(track => !hidden.has(track.id))
}
