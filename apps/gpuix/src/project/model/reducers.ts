import { PATTERN_STEPS_PER_BAR } from "./types"
import { MIN_CLIP_LENGTH_BARS } from "./grid"
import type { Clip, DocumentState, Track, TrackKind, WorkspaceState } from "./types"

export type DocumentCommand =
  | { type: "transport"; patch: Partial<DocumentState["transport"]> }
  | {
      type: "project"
      patch: Partial<Pick<DocumentState, "name" | "scaleRoot" | "scaleMode" | "groove">>
    }
  | { type: "loop"; patch: Partial<DocumentState["transport"]["loop"]> }
  | { type: "tracks"; tracks: Track[] }
  | { type: "markers"; markers: DocumentState["markers"] }

export function reduceDocument(document: DocumentState, command: DocumentCommand): DocumentState {
  switch (command.type) {
    case "transport": {
      return { ...document, transport: { ...document.transport, ...command.patch } }
    }
    case "project": {
      return { ...document, ...command.patch }
    }
    case "loop": {
      return {
        ...document,
        transport: {
          ...document.transport,
          loop: { ...document.transport.loop, ...command.patch },
        },
      }
    }
    case "tracks": {
      return { ...document, tracks: command.tracks }
    }
    case "markers": {
      return { ...document, markers: command.markers }
    }
  }
}

export function reduceWorkspace(
  workspace: WorkspaceState,
  patch: Partial<WorkspaceState>
): WorkspaceState {
  return { ...workspace, ...patch }
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createTrack(
  kind: Exclude<TrackKind, "main">,
  tracks: Track[],
  parentId: string | undefined,
  heightPx: number
): Track {
  const count = tracks.filter(track => track.kind === kind).length + 1
  return {
    id: uniqueId("track"),
    name: `${count} ${kind === "midi" ? "MIDI" : kind === "audio" ? "Audio" : kind === "group" ? "Group" : "Return"}`,
    kind,
    color: kind === "group" ? "oklch(0.65 0.17 265)" : "oklch(0.65 0.18 230)",
    solo: false,
    armed: false,
    mute: false,
    volumeDb: 0,
    pan: 0,
    input: kind === "audio" ? "external" : kind === "midi" ? "all" : "none",
    output: parentId ?? (kind === "midi" ? "none" : "main"),
    inputChannel: kind === "midi" ? "all" : kind === "audio" ? "1" : undefined,
    outputChannel: kind === "midi" ? "none" : "1-2",
    ...(kind === "return" && { returnPost: true }),
    sends: {},
    clips: [],
    heightPx,
    monitor: "auto",
    automation: [],
    ...(kind === "group" && { childTrackIds: [], collapsed: false }),
  }
}

export function createClip(kind: Clip["kind"], startBar: number, lengthBars: number): Clip {
  const common = {
    id: uniqueId("clip"),
    startBar: Math.max(1, startBar),
    lengthBars: Math.max(MIN_CLIP_LENGTH_BARS, lengthBars),
  }
  switch (kind) {
    case "audio": {
      return { ...common, kind, samplePath: "", gainDb: 0 }
    }
    case "midi": {
      return { ...common, kind, notes: [], loopBars: common.lengthBars }
    }
    case "pattern": {
      return {
        ...common,
        kind,
        patternId: uniqueId("pattern"),
        steps: Array.from({ length: PATTERN_STEPS_PER_BAR }, () => false),
      }
    }
  }
}

export function cloneClip(clip: Clip): Clip {
  return { ...structuredClone(clip), id: uniqueId("clip") }
}
export function cloneTrack(track: Track): Track {
  return {
    ...structuredClone(track),
    id: uniqueId("track"),
    name: `${track.name} Copy`,
    clips: track.clips.map(cloneClip),
    automation: track.automation.map(lane => ({
      ...lane,
      id: uniqueId("lane"),
      points: lane.points.map(point => ({ ...point, id: uniqueId("point") })),
    })),
  }
}

/**
Keeps every copy separate from source objects, including nested note/peak/automation arrays.
*/
export function mapClips(
  tracks: Track[],
  ids: string[],
  apply: (clip: Clip, track: Track) => Clip | null
): Track[] {
  const selected = new Set(ids)
  return tracks.map(track => ({
    ...track,
    clips: track.clips.flatMap(clip => {
      if (!selected.has(clip.id)) return [clip]
      const next = apply(clip, track)
      return next ? [next] : []
    }),
  }))
}
