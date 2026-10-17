import type { PREFERENCE_DEFAULTS } from "./preferences"
import type { DocumentState, SessionState, Track, TrackKind, WorkspaceState } from "../model/types"

type PreferenceValues = typeof PREFERENCE_DEFAULTS

export interface CreationNames {
  project: string
  main: string
  marker: string
  track(kind: Exclude<TrackKind, "main">, count: number): string
  copy(name: string): string
  clip(kind: "audio" | "midi" | "pattern"): string
}

export interface TrackCreationAppearance {
  heightPx: number
  mainHeightPx: number
  colors: Record<TrackKind, string>
}

export const PROJECT_TEMPLATE: ProjectTemplateSource = {
  musical: { scaleRoot: "C", scaleMode: "major", groove: 0 },
  transport: {
    bpm: 120,
    numerator: 4,
    denominator: 4,
    barLength: "1-bar",
    loop: { enabled: false, startBar: 1, lengthBars: 8 },
  },
  position: { bar: 1, beat: 1, sixteenth: 1 },
  track: {
    mixer: { solo: false, armed: false, mute: false, volumeDb: 0, pan: 0, monitor: "auto" },
    io: {
      audio: { input: "external", inputChannel: "1", output: "main", outputChannel: "1-2" },
      midi: { input: "all", inputChannel: "all", output: "none", outputChannel: "none" },
      group: { input: "none", output: "main", outputChannel: "1-2" },
      return: { input: "none", output: "main", outputChannel: "1-2", returnPost: true },
      main: {
        input: "none",
        output: "external",
        outputChannel: "1-2",
        cueOutput: "1-2",
        cueVolumeDb: 0,
      },
    },
  },
  timeline: { minimumBars: 128, growthStepBars: 16, paddingBars: 16 },
  clip: { gainDb: 0, fade: { curve: 0.35, position: 0.5, durationBars: 0, offsetBars: 0 } },
}

export interface ProjectTemplateSource {
  musical: Pick<DocumentState, "scaleRoot" | "scaleMode" | "groove">
  transport: Omit<DocumentState["transport"], "loop"> & {
    loop: { enabled: boolean; startBar: number; lengthBars: number }
  }
  position: SessionState["position"]
  track: {
    mixer: Pick<Track, "solo" | "armed" | "mute" | "volumeDb" | "pan" | "monitor">
    io: Record<
      TrackKind,
      Pick<
        Track,
        | "input"
        | "output"
        | "inputChannel"
        | "outputChannel"
        | "returnPost"
        | "cueOutput"
        | "cueVolumeDb"
      >
    >
  }
  timeline: { minimumBars: number; growthStepBars: number; paddingBars: number }
  clip: {
    gainDb: number
    fade: { curve: number; position: number; durationBars: number; offsetBars: number }
  }
}

export function createUnopenedDocument(
  source: ProjectTemplateSource = PROJECT_TEMPLATE
): DocumentState {
  const { loop, ...transport } = source.transport
  return {
    name: "",
    ...source.musical,
    transport: {
      ...transport,
      loop: {
        enabled: loop.enabled,
        startBar: loop.startBar,
        endBar: loop.startBar + loop.lengthBars,
      },
    },
    tracks: [],
    markers: [],
  }
}

export function createWorkspaceTemplate(preferences: PreferenceValues): WorkspaceState {
  const { gridMode, gridDensity, fixedGridBars, ...workspace } = preferences.workspace
  const grid: WorkspaceState["grid"] =
    gridMode === "fixed"
      ? { mode: gridMode, bars: fixedGridBars }
      : { mode: gridMode, density: gridDensity }
  return { ...workspace, scrollX: 0, scrollY: 0, grid, dockLayout: null }
}

export function createProjectTemplate({
  names,
  appearance,
  preferences,
  source = PROJECT_TEMPLATE,
}: {
  names: CreationNames
  appearance: TrackCreationAppearance
  preferences: PreferenceValues
  source?: ProjectTemplateSource
}): { document: DocumentState; workspace: WorkspaceState } {
  return {
    document: {
      ...createUnopenedDocument(source),
      name: names.project,
      tracks: [
        {
          id: "main",
          name: names.main,
          kind: "main",
          color: appearance.colors.main,
          ...source.track.mixer,
          ...source.track.io.main,
          sends: {},
          clips: [],
          heightPx: appearance.mainHeightPx,
          automation: [],
        },
      ],
    },
    workspace: createWorkspaceTemplate(preferences),
  }
}

export function createSessionTemplate(
  preferences: Pick<PreferenceValues, "midi">,
  source: ProjectTemplateSource = PROJECT_TEMPLATE
): SessionState {
  return {
    editEpoch: crypto.randomUUID(),
    playing: false,
    recording: false,
    position: { ...source.position },
    insertionPoint: null,
    selectedTrackIds: [],
    trackSelectionSurface: "arrangement",
    selectedClipIds: [],
    timeSelection: null,
    editingClipId: null,
    clipEditorRequest: 0,
    levels: {},
    dirty: false,
    canUndo: false,
    canRedo: false,
    filePath: null,
    fileError: null,
    saveBlocked: false,
    saveAsRequest: 0,
    openRequest: 0,
    preview: null,
    backend: { phase: "idle", sessionId: "", pending: 0, acceptedRevision: 0, error: null },
    activeMidiNotes: [],
    midiOctave: preferences.midi.keyboardOctave,
    midiVelocity: preferences.midi.velocity,
    drawModeOverride: null,
    automationParameters: {},
  }
}
