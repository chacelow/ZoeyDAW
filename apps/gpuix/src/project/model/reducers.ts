import { PROJECT_TEMPLATE } from "../defaults/template"
import type {
  CreationNames,
  TrackCreationAppearance,
  ProjectTemplateSource,
} from "../defaults/template"
import { clampFadeIntervals } from "./fades"
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
  creation: {
    names: CreationNames
    appearance: TrackCreationAppearance
    source?: ProjectTemplateSource
  }
): Track {
  const count = tracks.filter(track => track.kind === kind).length + 1
  const source = creation.source ?? PROJECT_TEMPLATE
  return {
    id: uniqueId("track"),
    name: creation.names.track(kind, count),
    kind,
    color: creation.appearance.colors[kind],
    ...source.track.mixer,
    ...source.track.io[kind],
    output: parentId ?? source.track.io[kind].output,
    sends: {},
    clips: [],
    heightPx: creation.appearance.heightPx,
    automation: [],
    ...(kind === "group" && { childTrackIds: [], collapsed: false }),
  }
}

export function createClip(
  kind: Clip["kind"],
  startBar: number,
  lengthBars: number,
  source: ProjectTemplateSource = PROJECT_TEMPLATE
): Clip {
  const common = {
    id: uniqueId("clip"),
    startBar: Math.max(1, startBar),
    lengthBars: Math.max(MIN_CLIP_LENGTH_BARS, lengthBars),
  }
  switch (kind) {
    case "audio": {
      return clampFadeIntervals({
        ...common,
        kind,
        samplePath: "",
        gainDb: source.clip.gainDb,
        fadeInBars: source.clip.fade.durationBars,
        fadeOutBars: source.clip.fade.durationBars,
        fadeInOffsetBars: source.clip.fade.offsetBars,
        fadeOutOffsetBars: source.clip.fade.offsetBars,
        fadeInCurve: source.clip.fade.curve,
        fadeOutCurve: source.clip.fade.curve,
        fadeInCurvePosition: source.clip.fade.position,
        fadeOutCurvePosition: source.clip.fade.position,
      })
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
export function cloneTrack(track: Track, names: Pick<CreationNames, "copy">): Track {
  return {
    ...structuredClone(track),
    id: uniqueId("track"),
    name: names.copy(track.name),
    clips: track.clips.map(cloneClip),
    automation: track.automation.map(lane => ({
      ...lane,
      id: uniqueId("lane"),
      points: lane.points.map(point => ({ ...point, id: uniqueId("point") })),
    })),
  }
}

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
