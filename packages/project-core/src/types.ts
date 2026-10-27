import type { ProjectRuntimeStatus, BackendLauncherSnapshot } from "./backend"
import type { GridSettings } from "./grid"
import type { AudioClipSettings } from "./audio-editor"
import type { Device } from "./devices"
import type { MediaSource } from "./media"
export type { MediaSource, MediaLocation } from "./media"

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
export type AutomationTarget =
  | { kind: "mixer"; parameter: "volume" | "pan" | "tempo" }
  | { kind: "device"; deviceId: string; parameter: string }
export interface AutomationLane {
  id: string
  target: AutomationTarget
  points: AutomationPoint[]
}
export interface ClipBase {
  id: string
  startBar: number
  lengthBars: number
  /**
  Source start relative to retained audio or MIDI note content.
  */
  sourceOffsetBars?: number
  label?: string
  color?: string
  /**
  Muted clips stay visible but render greyed out and contribute no audio.
  */
  mute?: boolean
}
export interface AudioClip extends ClipBase {
  kind: "audio"
  sourceId: string | null
  sourceTempo?: "unknown"
  waveformPeaks?: number[]
  gainDb: number
  audioSettings?: AudioClipSettings
  fadeInBars?: number
  fadeOutBars?: number
  /**
  Inward displacement of the quiet boundary from the visible left/right edge.
  */
  fadeInOffsetBars?: number
  fadeOutOffsetBars?: number
  /**
  Normalized Bézier bend, -1 to 1; omission uses the shared musical default.
  */
  fadeInCurve?: number
  fadeOutCurve?: number
  /**
  Horizontal fraction inside the fade interval, 0.1 to 0.9; omission centers the anchor.
  */
  fadeInCurvePosition?: number
  fadeOutCurvePosition?: number
}
export interface MidiNote {
  id?: string
  pitch: number
  /**
  Beat position in the retained source, not the trimmed visible clip.
  */
  startBeat: number
  lengthBeats: number
  velocity: number
}
export interface MidiClip extends ClipBase {
  kind: "midi"
  notes: MidiNote[]
  /**
  Length of the repeating source cycle; legacy clips use their authored length.
  */
  loopBars?: number
}
export interface MidiPattern {
  id: string
  notes: MidiNote[]
  loopBars: number
}
export interface PatternClip extends ClipBase {
  kind: "pattern"
  patternId: string
}
export type Clip = AudioClip | MidiClip | PatternClip
export type AudioClipContent = Omit<AudioClip, "startBar">
export type MidiClipContent = Omit<MidiClip, "startBar">
export type PatternClipContent = Omit<PatternClip, "startBar">
export type ClipContent = AudioClipContent | MidiClipContent | PatternClipContent
export type LaunchQuantization =
  | "none"
  | "eightBars"
  | "fourBars"
  | "twoBars"
  | "bar"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
export interface LauncherScene {
  id: string
  name: string
  color?: string
}
export interface ClipSlot {
  sceneId: string
  clip: ClipContent
}
export interface LauncherDocument {
  scenes: LauncherScene[]
  quantization: LaunchQuantization
}
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
  clipSlots?: ClipSlot[]
  /**
  Secondary hardware/input channel, independent of the routing destination.
  */
  inputChannel?: string
  outputChannel?: string
  cueOutput?: string
  cueVolumeDb?: number
  returnPost?: boolean
  /**
  Send gain by return track ID; omitted entries are silent.
  */
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
  media: MediaSource[]
  patterns: MidiPattern[]
  markers: Marker[]
  launcher: LauncherDocument
}
export interface ArrangementView {
  routing: boolean
  returns: boolean
  overview: boolean
}

/**
Time-ruler formats. `time` shows m:ss, the fps variants show hh:mm:ss:ff
timecode. `drop` is the 29.97 drop-frame variant, which skips frame numbers
0 and 1 each minute except every tenth minute.
*/
export type RulerFormat = "time" | "24" | "25" | "30" | "29.97-drop" | "29.97-non-drop"

export interface WorkspaceState {
  pxPerBar: number
  scrollX: number
  scrollY: number
  snap: boolean
  grid: GridSettings
  follow: boolean
  automationMode: boolean
  automationLanes: Record<string, AutomationTarget[]>
  arrangementView: ArrangementView
  rulerFormat: RulerFormat
  drawMode: boolean
  computerKeyboard: boolean
  link: boolean
  metronome: boolean
}
export interface TimeSelection {
  startBar: number
  endBar: number
  trackIds: string[]
  /** `subtle` draws the same span at half strength, used for loop clicks. */
  emphasis?: "subtle"
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
  automationRecordMode: "read" | "touch" | "latch"
  position: Position
  insertionPoint: { trackId: string | null; bar: number } | null
  selectedTrackIds: string[]
  trackSelectionSurface: "arrangement" | "header" | "launcher"
  selectedClipIds: string[]
  timeSelection: TimeSelection | null
  editingClipId: string | null
  clipEditorRequest: number
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  snapshotError: string | null
  preview: ProjectPreview | null
  backend: ProjectRuntimeStatus
  launcher: BackendLauncherSnapshot | null
  activeMidiNotes: number[]
  midiOctave: number
  midiVelocity: number
  drawModeOverride: boolean | null
  automationTargets: Record<string, AutomationTarget | null>
}
export interface ProjectState {
  document: DocumentState
  workspace: WorkspaceState
  session: SessionState
}

export function positionToBar(position: Position, numerator: number): number {
  return position.bar + (position.beat - 1 + (position.sixteenth - 1) / 4) / numerator
}

/**
Tracks remain in document order; collapsed group descendants alone are hidden.
*/
export function visibleTracks(tracks: readonly Track[]): Track[] {
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
