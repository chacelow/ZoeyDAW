import { MIN_CLIP_LENGTH_BARS } from "./grid"
import type { Clip, DocumentState, Track, TrackKind, WorkspaceState } from "./types"
import { ensurePatternReferences } from "./patterns"

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
      const denominator = command.patch.denominator
      if (
        denominator !== undefined &&
        (denominator < 1 || denominator > 32 || !Number.isInteger(Math.log2(denominator)))
      )
        return document
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
      return command.tracks.some(isOrdinaryTrack)
        ? ensurePatternReferences({ ...document, tracks: command.tracks })
        : document
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

export const DEFAULT_TRACK_COLOR = "oklch(0.65 0.18 230)"

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
    color: kind === "group" ? "oklch(0.65 0.17 265)" : DEFAULT_TRACK_COLOR,
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
    monitor: kind === "audio" ? "off" : "auto",
    automation: [],
    ...(kind === "group" && { childTrackIds: [], collapsed: false }),
  }
}

export function isOrdinaryTrack(track: Track): boolean {
  return track.kind === "audio" || track.kind === "midi"
}

export function ensureOrdinaryTrack(document: DocumentState, heightPx: number): DocumentState {
  if (document.tracks.some(isOrdinaryTrack)) return document
  const track = createTrack("audio", document.tracks, undefined, heightPx)
  const tracks = [...document.tracks]
  const index = tracks.findIndex(item => item.kind === "return" || item.kind === "main")
  tracks.splice(index === -1 ? tracks.length : index, 0, track)
  return { ...document, tracks }
}

export function createClip(kind: Clip["kind"], startBar: number, lengthBars: number): Clip {
  const common = {
    id: uniqueId("clip"),
    startBar: Math.max(1, startBar),
    lengthBars: Math.max(MIN_CLIP_LENGTH_BARS, lengthBars),
  }
  switch (kind) {
    case "audio": {
      return { ...common, kind, sourceId: null, gainDb: 0 }
    }
    case "midi": {
      return { ...common, kind, notes: [], loopBars: common.lengthBars }
    }
    case "pattern": {
      return {
        ...common,
        kind,
        patternId: uniqueId("pattern"),
      }
    }
  }
}

export function cloneClip(clip: Clip): Clip {
  return { ...structuredClone(clip), id: uniqueId("clip") }
}
export function cloneTrack(track: Track): Track {
  const devices = track.devices?.map(device => ({ ...device, id: uniqueId("device") }))
  const copiedDeviceId = (id: string) => {
    const index = track.devices?.findIndex(device => device.id === id)
    const device = index === undefined ? undefined : devices?.[index]
    if (!device) throw new Error(`Automation device ${id} is missing from track ${track.id}`)
    return device.id
  }
  return {
    ...structuredClone(track),
    id: uniqueId("track"),
    name: `${track.name} Copy`,
    clips: track.clips.map(cloneClip),
    ...(devices && { devices }),
    automation: track.automation.map(lane => ({
      ...lane,
      id: uniqueId("lane"),
      target:
        lane.target.kind === "device"
          ? { ...lane.target, deviceId: copiedDeviceId(lane.target.deviceId) }
          : lane.target,
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
