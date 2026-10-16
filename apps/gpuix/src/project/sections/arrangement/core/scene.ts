import { deriveGridPlan } from "@/project/model/grid"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import {
  PROJECT_TEMPLATE,
  createUnopenedDocument,
  createWorkspaceTemplate,
} from "@/project/defaults/template"
import type { ProjectTemplateSource } from "@/project/defaults/template"
import type { LayoutTokens } from "@/shared/theme/layout-tokens"

import type { GridPlan, GridSettings } from "@/project/model/grid"
import type {
  AutomationLane,
  LoopRegion,
  Marker,
  ProjectPreview,
  SessionState,
  TimeSelection,
  Track,
} from "@/project/model/types"
export type ArrangementGeometry = Pick<LayoutTokens, "track" | "arrangement">

export interface ArrangementViewport {
  pxPerBar: number
  scrollX: number
  scrollY: number
  width: number
  height: number
  dpr: number
}

export type CanvasTargetSelection =
  | { kind: "none" }
  | { kind: "loop" }
  | { kind: "clip"; id: string; phase: "selected" | "renaming" }
  | { kind: "marker"; id: string; phase: "selected" | "renaming" }
  | { kind: "automation"; trackId: string; laneId: string; pointIds: readonly string[] }
  | {
      kind: "automation-value"
      trackId: string
      laneId: string
      pointId: string
      pointIds: readonly string[]
    }

export interface SceneMusic {
  bars: number
  grid: GridSettings
  transport: { bpm: number; numerator: number; denominator: number }
  markers: readonly Marker[]
  loop: LoopRegion
  tracks: readonly Track[]
}

export interface ArrangementScene extends SceneMusic {
  revision: number
  geometry: ArrangementGeometry
  gridPlan: GridPlan
  playback: Pick<SessionState, "playing" | "insertionPoint">
  viewport: ArrangementViewport
  previewTracks: readonly Track[] | null
  clipDrag: { source: readonly Track[]; ids: ReadonlySet<string> } | null
  clipResize: { id: string; edge: "left" | "right" } | null
  previewMarkers: readonly Marker[] | null
  previewLoop: LoopRegion | null
  selectedClipIds: ReadonlySet<string>
  selectedTrackIds: ReadonlySet<string>
  hoverClip: { id: string; region: "title" | "body" } | null
  timeSelection: TimeSelection | null
  timeSelectionPreview: TimeSelection | null
  targetSelection: CanvasTargetSelection
  automationParameters: Readonly<Record<string, AutomationLane["parameter"]>>
}

export interface SceneStore {
  get: () => ArrangementScene
  subscribe: (listener: (scene: ArrangementScene) => void) => () => void
  setViewport: (viewport: ArrangementViewport) => void
  setGeometry: (geometry: ArrangementGeometry) => void
  setMusic: (input: SceneMusic) => void
  setPlayback: (playback: ArrangementScene["playback"]) => void
  setSelection: (ids: ReadonlySet<string>) => void
  setTrackSelection: (ids: ReadonlySet<string>) => void
  setProjectPreview: (preview: ProjectPreview | null) => void
  setClipDrag: (drag: ArrangementScene["clipDrag"]) => void
  setClipResize: (resize: ArrangementScene["clipResize"]) => void
  setTargetSelection: (selection: CanvasTargetSelection) => void
  setAutomationParameters: (parameters: ArrangementScene["automationParameters"]) => void
  setHover: (hover: ArrangementScene["hoverClip"]) => void
  setTimeSelection: (selection: TimeSelection | null) => void
  setTimeSelectionPreview: (selection: TimeSelection | null) => void
}

export function createSceneStore(
  geometry: ArrangementGeometry,
  {
    template = PROJECT_TEMPLATE,
    preferences = PREFERENCE_DEFAULTS,
  }: {
    template?: ProjectTemplateSource
    preferences?: typeof PREFERENCE_DEFAULTS
  } = {}
): SceneStore {
  const document = createUnopenedDocument(template)
  const workspace = createWorkspaceTemplate(preferences)
  const { bpm, numerator, denominator } = document.transport
  let committedTimeSelection: TimeSelection | null = null
  let source: SceneMusic = {
    bars: template.timeline.minimumBars,
    grid: workspace.grid,
    transport: { bpm, numerator, denominator },
    markers: document.markers,
    loop: document.transport.loop,
    tracks: document.tracks,
  }
  let scene: ArrangementScene = {
    ...source,
    revision: 0,
    geometry,
    viewport: {
      pxPerBar: workspace.pxPerBar,
      scrollX: workspace.scrollX,
      scrollY: workspace.scrollY,
      width: 0,
      height: 0,
      dpr: 1,
    },
    gridPlan: deriveGridPlan(
      source.grid,
      workspace.pxPerBar,
      source.transport.numerator,
      source.transport.denominator
    ),
    playback: { playing: false, insertionPoint: null },
    previewTracks: null,
    clipDrag: null,
    clipResize: null,
    previewMarkers: null,
    previewLoop: null,
    selectedClipIds: new Set(),
    selectedTrackIds: new Set(),
    hoverClip: null,
    timeSelection: null,
    timeSelectionPreview: null,
    targetSelection: { kind: "none" },
    automationParameters: {},
  }
  const listeners = new Set<(scene: ArrangementScene) => void>()
  function bump(next: ArrangementScene) {
    scene = { ...next, revision: scene.revision + 1 }
    for (const listener of listeners) {
      listener(scene)
    }
  }
  return {
    get: () => scene,
    setGeometry(geometry) {
      if (scene.geometry === geometry) return
      bump({ ...scene, geometry })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setViewport(viewport) {
      if (viewportEquals(scene.viewport, viewport)) {
        return
      }
      bump({
        ...scene,
        viewport,
        gridPlan: deriveGridPlan(
          source.grid,
          viewport.pxPerBar,
          source.transport.numerator,
          source.transport.denominator
        ),
      })
    },
    setPlayback(playback) {
      const previous = scene.playback
      if (
        previous.playing === playback.playing &&
        previous.insertionPoint?.trackId === playback.insertionPoint?.trackId &&
        previous.insertionPoint?.bar === playback.insertionPoint?.bar
      ) {
        return
      }
      bump({ ...scene, playback })
    },
    setMusic(input) {
      if (musicEquals(source, input)) {
        return
      }
      source = input
      bump({
        ...scene,
        ...input,
        gridPlan: deriveGridPlan(
          input.grid,
          scene.viewport.pxPerBar,
          input.transport.numerator,
          input.transport.denominator
        ),
        tracks: scene.previewTracks ?? input.tracks,
        markers: scene.previewMarkers ?? input.markers,
        loop: scene.previewLoop ?? input.loop,
      })
    },
    setProjectPreview(preview) {
      const previewTracks = preview?.kind === "tracks" ? preview.tracks : null
      const previewMarkers = preview?.kind === "markers" ? preview.markers : null
      const previewLoop = preview?.kind === "loop" ? preview.loop : null
      if (
        scene.previewTracks === previewTracks &&
        scene.previewMarkers === previewMarkers &&
        scene.previewLoop === previewLoop
      ) {
        return
      }
      bump({
        ...scene,
        previewTracks,
        previewMarkers,
        previewLoop,
        tracks: previewTracks ?? source.tracks,
        markers: previewMarkers ?? source.markers,
        loop: previewLoop ?? source.loop,
      })
    },
    setClipDrag(clipDrag) {
      if (scene.clipDrag === clipDrag) {
        return
      }
      bump({ ...scene, clipDrag })
    },
    setClipResize(clipResize) {
      if (scene.clipResize?.id === clipResize?.id && scene.clipResize?.edge === clipResize?.edge) {
        return
      }
      bump({ ...scene, clipResize })
    },
    setTargetSelection(selection) {
      if (targetEquals(scene.targetSelection, selection)) {
        return
      }
      bump({ ...scene, targetSelection: selection })
    },
    setAutomationParameters(parameters) {
      if (scene.automationParameters === parameters) {
        return
      }
      bump({ ...scene, automationParameters: parameters })
    },
    setSelection(ids) {
      if (setEquals(scene.selectedClipIds, ids)) {
        return
      }
      bump({ ...scene, selectedClipIds: ids })
    },
    setTrackSelection(ids) {
      if (setEquals(scene.selectedTrackIds, ids)) {
        return
      }
      bump({ ...scene, selectedTrackIds: ids })
    },
    setHover(hover) {
      if (scene.hoverClip?.id === hover?.id && scene.hoverClip?.region === hover?.region) {
        return
      }
      bump({ ...scene, hoverClip: hover })
    },
    setTimeSelection(selection) {
      committedTimeSelection = selection
      const visible = scene.timeSelectionPreview ?? committedTimeSelection
      if (timeSelectionEquals(scene.timeSelection, visible)) return
      bump({ ...scene, timeSelection: visible })
    },
    setTimeSelectionPreview(selection) {
      if (timeSelectionEquals(scene.timeSelectionPreview, selection)) return
      bump({
        ...scene,
        timeSelectionPreview: selection,
        timeSelection: selection ?? committedTimeSelection,
      })
    },
  }
}

function timeSelectionEquals(a: TimeSelection | null, b: TimeSelection | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.startBar === b.startBar &&
      a.endBar === b.endBar &&
      a.trackIds.length === b.trackIds.length &&
      a.trackIds.every((id, index) => id === b.trackIds[index]))
  )
}

function viewportEquals(a: ArrangementViewport, b: ArrangementViewport): boolean {
  return (
    a.pxPerBar === b.pxPerBar &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.width === b.width &&
    a.height === b.height &&
    a.dpr === b.dpr
  )
}

function musicEquals(a: SceneMusic, b: SceneMusic): boolean {
  return (
    a.bars === b.bars &&
    a.grid === b.grid &&
    a.transport.bpm === b.transport.bpm &&
    a.transport.numerator === b.transport.numerator &&
    a.transport.denominator === b.transport.denominator &&
    a.markers === b.markers &&
    a.loop === b.loop &&
    a.tracks === b.tracks
  )
}

function setEquals<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function targetEquals(a: CanvasTargetSelection, b: CanvasTargetSelection): boolean {
  if (a === b) {
    return true
  }
  switch (a.kind) {
    case "none": {
      return b.kind === "none"
    }
    case "loop": {
      return b.kind === "loop"
    }
    case "clip": {
      return b.kind === "clip" && a.id === b.id && a.phase === b.phase
    }
    case "marker": {
      return b.kind === "marker" && a.id === b.id && a.phase === b.phase
    }
    case "automation": {
      return (
        b.kind === "automation" &&
        a.trackId === b.trackId &&
        a.laneId === b.laneId &&
        a.pointIds.length === b.pointIds.length &&
        a.pointIds.every((id, index) => id === b.pointIds[index])
      )
    }
    case "automation-value": {
      return (
        b.kind === "automation-value" &&
        a.trackId === b.trackId &&
        a.laneId === b.laneId &&
        a.pointId === b.pointId &&
        a.pointIds.length === b.pointIds.length &&
        a.pointIds.every((id, index) => id === b.pointIds[index])
      )
    }
  }
}
