import { PREFERENCE_DEFAULTS } from "../defaults/preferences"
import {
  createProjectTemplate,
  createSessionTemplate,
  createWorkspaceTemplate,
} from "../defaults/template"
import type { CreationNames, TrackCreationAppearance } from "../defaults/template"
import type { ProjectCreationConfiguration } from "./runtime"
import type { DocumentState, Track, WorkspaceState } from "../model/types"

export const TEST_CREATION_NAMES: CreationNames = {
  project: "Test project",
  main: "Main",
  marker: "Marker",
  track: (kind, count) =>
    `${count} ${{ audio: "Audio", midi: "MIDI", group: "Group", return: "Return" }[kind]}`,
  copy: name => `${name} Copy`,
  clip: kind => ({ audio: "Audio Clip", midi: "MIDI Clip", pattern: "Pattern" })[kind],
}
export const TEST_TRACK_APPEARANCE: TrackCreationAppearance = {
  heightPx: 70,
  mainHeightPx: 108,
  colors: {
    audio: "oklch(0.65 0.18 230)",
    midi: "oklch(0.65 0.18 230)",
    group: "oklch(0.65 0.17 265)",
    return: "oklch(0.65 0.18 230)",
    main: "var(--chart-3)",
  },
}
export const TEST_CREATION = { names: TEST_CREATION_NAMES, appearance: TEST_TRACK_APPEARANCE }
export const TEST_PROJECT_CREATION: ProjectCreationConfiguration = {
  names: () => TEST_CREATION_NAMES,
  appearance: () => TEST_TRACK_APPEARANCE,
  preferences: () => PREFERENCE_DEFAULTS,
}
export function createTestDocument(): DocumentState {
  return createProjectTemplate({ ...TEST_CREATION, preferences: PREFERENCE_DEFAULTS }).document
}
export function createTestWorkspace(): WorkspaceState {
  return createWorkspaceTemplate(PREFERENCE_DEFAULTS)
}
export function createTestSession() {
  return createSessionTemplate(PREFERENCE_DEFAULTS)
}
/**
Derived preview samples from the visible source span; never serialized.
*/
export function mockWaveformPeaks(
  samplePath: string,
  sourceOffsetBars = 0,
  lengthBars?: number
): number[] | undefined {
  const sourceBars =
    samplePath === "mock://kick.wav" ? 16 : samplePath === "mock://untitled.wav" ? 1 : 0
  if (!sourceBars) {
    return undefined
  }
  const sampleCount = samplePath === "mock://kick.wav" ? 64 : 32
  const visibleBars = lengthBars ?? sourceBars
  const count = Math.min(2048, Math.max(1, Math.round((visibleBars / sourceBars) * sampleCount)))
  return Array.from({ length: count }, (_, index) => {
    const offset = sourceOffsetBars % sourceBars
    const travel = ((index / count) * visibleBars) % sourceBars
    const sourceBar = (((offset + travel) % sourceBars) + sourceBars) % sourceBars
    const phase = (2 * Math.PI * sourceBar) / sourceBars
    return (
      0.4 +
      (samplePath === "mock://kick.wav"
        ? 0.4 * Math.abs(Math.sin(phase * 7))
        : 0.3 * Math.sin(phase * 5) ** 2)
    )
  })
}

const base = {
  solo: false,
  armed: false,
  mute: false,
  volumeDb: 0,
  pan: 0,
  heightPx: 70,
  monitor: "auto" as const,
  automation: [],
  outputChannel: "1-2",
  sends: {},
}
const tracks: Track[] = [
  {
    ...base,
    id: "drums-group",
    name: "Drums",
    kind: "group",
    color: "var(--chart-3)",
    input: "none",
    output: "main",
    childTrackIds: ["trager", "sidechain"],
    collapsed: false,
    clips: [],
  },
  {
    ...base,
    id: "trager",
    name: "trager",
    kind: "midi",
    color: "var(--chart-1)",
    input: "all",
    inputChannel: "all",
    outputChannel: "none",
    output: "drums-group",
    armed: true,
    clips: [
      {
        id: "trager-1",
        kind: "midi",
        startBar: 1,
        lengthBars: 8,
        loopBars: 8,
        notes: [
          { id: "n1", pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 100 },
          { id: "n2", pitch: 64, startBeat: 2, lengthBeats: 1, velocity: 100 },
          { id: "n3", pitch: 67, startBeat: 4, lengthBeats: 2, velocity: 100 },
        ],
      },
    ],
  },
  {
    ...base,
    id: "sidechain",
    name: "sidechain",
    kind: "midi",
    color: "var(--chart-5)",
    input: "all",
    inputChannel: "all",
    outputChannel: "none",
    output: "drums-group",
    collapsed: true,
    clips: [],
  },
  {
    ...base,
    id: "3-audio",
    name: "3 Audio",
    kind: "audio",
    color: "var(--chart-2)",
    input: "external",
    inputChannel: "1",
    output: "main",
    volumeDb: -7.1,
    pan: -0.25,
    heightPx: 70,
    automation: [
      {
        id: "3-audio-volume",
        parameter: "volume",
        points: [
          { id: "fade-up", bar: 1, value: 0.35 },
          { id: "peak", bar: 9, value: 0.85 },
          { id: "tail", bar: 17, value: 0.5 },
        ],
      },
      {
        id: "3-audio-pan",
        parameter: "pan",
        points: [
          { id: "pan-left", bar: 1, value: 0.25 },
          { id: "pan-right", bar: 17, value: 0.75 },
        ],
      },
    ],
    clips: [
      {
        id: "audio-1",
        kind: "audio",
        startBar: 1,
        lengthBars: 16,
        samplePath: "mock://kick.wav",
        gainDb: 0,
        fadeInBars: 0.25,
        fadeOutBars: 0.5,
      },
    ],
  },
  {
    ...base,
    id: "4-midi",
    name: "4 MIDI",
    kind: "midi",
    color: "var(--chart-3)",
    input: "all",
    inputChannel: "all",
    outputChannel: "none",
    output: "none",
    clips: [],
  },
  {
    ...base,
    id: "a-apply",
    name: "A apply",
    kind: "return",
    color: "var(--chart-4)",
    input: "none",
    output: "main",
    returnPost: true,
    collapsed: true,
    clips: [],
  },
  {
    ...base,
    id: "main",
    name: "Main",
    kind: "main",
    color: "var(--chart-5)",
    input: "none",
    output: "external",
    cueOutput: "1-2",
    cueVolumeDb: 0,
    clips: [],
  },
]

export function createMockDocument(): DocumentState {
  return {
    ...createTestDocument(),
    tracks: tracks.map(track => structuredClone(track)),
    markers: [
      { id: "intro", bar: 1, label: "Intro" },
      { id: "verse", bar: 17, label: "Verse" },
    ],
  }
}
export function createMockWorkspace(): WorkspaceState {
  return createTestWorkspace()
}
