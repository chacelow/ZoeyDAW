import { DEFAULT_GRID } from "./grid"
import { fixtureMediaSource } from "./media"
import type { DocumentState, Track, WorkspaceState } from "./types"

export function createTestDocument(): DocumentState {
  const base: Pick<
    Track,
    | "solo"
    | "armed"
    | "mute"
    | "volumeDb"
    | "pan"
    | "heightPx"
    | "monitor"
    | "automation"
    | "outputChannel"
    | "sends"
  > = {
    solo: false,
    armed: false,
    mute: false,
    volumeDb: 0,
    pan: 0,
    heightPx: 70,
    monitor: "auto",
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
      automation: [
        {
          id: "3-audio-volume",
          target: { kind: "mixer", parameter: "volume" },
          points: [
            { id: "fade-up", bar: 1, value: 0.35 },
            { id: "peak", bar: 9, value: 0.85 },
            { id: "tail", bar: 17, value: 0.5 },
          ],
        },
        {
          id: "3-audio-pan",
          target: { kind: "mixer", parameter: "pan" },
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
          sourceId: "mock://kick.wav",
          gainDb: 0,
          fadeInBars: 0.25,
          fadeOutBars: 0.5,
          waveformPeaks: [0.4, 0.8, 0.6, 0.4],
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
  return {
    name: "未命名项目",
    scaleRoot: "C",
    scaleMode: "major",
    groove: 0,
    transport: {
      bpm: 120,
      numerator: 4,
      denominator: 4,
      barLength: "1-bar",
      loop: { enabled: false, startBar: 1, endBar: 9 },
    },
    tracks: tracks.map(track => structuredClone(track)),
    markers: [
      { id: "intro", bar: 1, label: "Intro" },
      { id: "verse", bar: 17, label: "Verse" },
    ],
    media: [fixtureMediaSource("mock://kick.wav")],
    patterns: [],
  }
}

export function createTestWorkspace(): WorkspaceState {
  return {
    pxPerBar: 24,
    scrollX: 0,
    scrollY: 0,
    snap: true,
    grid: DEFAULT_GRID,
    follow: true,
    automationMode: false,
    automationLanes: {},
    arrangementView: { routing: true, returns: true, overview: true },
    rulerFormat: "time",
    drawMode: false,
    computerKeyboard: false,
    link: false,
    metronome: false,
  }
}
