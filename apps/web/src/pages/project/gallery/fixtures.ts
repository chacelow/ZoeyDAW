import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { mockWaveformPeaks } from "@zoeydaw/project-runtime/testing"
import { defaultAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import type { ProjectSeed } from "@zoeydaw/project-runtime"
import type { Track } from "@zoeydaw/project-core/types"
import { fixtureMediaSource } from "@zoeydaw/project-core/media"

export const PREVIEW_KINDS = [
  "tracks",
  "groups",
  "clips",
  "audio",
  "piano-roll",
  "automation",
  "devices",
  "track-editor",
] as const
export type PreviewKind = (typeof PREVIEW_KINDS)[number]
export function parsePreviewKind(value: string | undefined): PreviewKind {
  return PREVIEW_KINDS.find(kind => kind === value) ?? "tracks"
}
export interface GalleryFixtureNames {
  project: string
  ensemble: string
  drums: string
  percussion: string
  synths: string
  lead: string
  keys: string
  returnA: string
  returnB: string
  main: string
  audio: string
  midi: string
  pattern: string
  emptyAudio: string
  reverseAudio: string
  emptyMidi: string
  emptyPattern: string
  intro: string
  verse: string
}

export function createGallerySeed(kind: PreviewKind, names: GalleryFixtureNames): ProjectSeed {
  const base = {
    solo: false,
    armed: false,
    mute: false,
    volumeDb: -9,
    pan: 0,
    input: "none",
    output: "main",
    outputChannel: "1-2",
    heightPx: 126,
    monitor: "auto",
    automation: [],
    sends: { "return-a": -12, "return-b": -18 },
  } satisfies Partial<Track>
  const audio: Track = {
    ...base,
    id: "gallery-audio",
    kind: "audio",
    name: names.lead,
    color: "var(--chart-2)",
    input: "external",
    inputChannel: "1",
    output: "ensemble",
    automation: [
      {
        id: "audio-volume",
        target: { kind: "mixer", parameter: "volume" },
        points: [
          { id: "volume-1", bar: 1, value: 0.2 },
          { id: "volume-2", bar: 3, value: 0.85, curve: 0.25 },
          { id: "volume-3", bar: 5, value: 0.45 },
          { id: "volume-4", bar: 9, value: 0.65 },
        ],
      },
      {
        id: "audio-pan",
        target: { kind: "mixer", parameter: "pan" },
        points: [
          { id: "pan-1", bar: 1, value: 0.3 },
          { id: "pan-2", bar: 5, value: 0.7 },
        ],
      },
    ],
    devices: [
      {
        id: "gallery-utility",
        kind: "utility",
        enabled: true,
        collapsed: false,
        gainDb: -3,
        pan: 0,
        width: 100,
      },
      {
        id: "gallery-filter",
        kind: "filter",
        enabled: true,
        collapsed: false,
        frequency: 1400,
        resonance: 0.3,
      },
      {
        id: "gallery-delay",
        kind: "delay",
        enabled: false,
        collapsed: false,
        timeMs: 375,
        feedback: 0.35,
        mix: 0.2,
      },
      {
        id: "gallery-reverb",
        kind: "reverb",
        enabled: true,
        collapsed: true,
        decay: 2.5,
        size: 0.5,
        mix: 0.25,
      },
    ],
    clips: [
      {
        id: "gallery-audio-clip",
        kind: "audio",
        label: names.audio,
        startBar: 1,
        lengthBars: 4,
        sourceId: "mock://kick.wav",
        waveformPeaks: mockWaveformPeaks("mock://kick.wav", 0, 4),
        gainDb: 0,
        fadeInBars: 0.5,
        fadeOutBars: 0.75,
        fadeInCurve: 0.3,
        fadeOutCurve: -0.2,
      },
      {
        id: "gallery-audio-override",
        kind: "audio",
        label: names.reverseAudio,
        color: "var(--chart-4)",
        startBar: 6,
        lengthBars: 3,
        sourceId: "mock://untitled.wav",
        waveformPeaks: mockWaveformPeaks("mock://untitled.wav", 0, 3),
        gainDb: -3,
        fadeInBars: 0,
        fadeOutBars: 0,
        audioSettings: {
          ...defaultAudioClipSettings(120, { lengthBars: 3 }),
          warp: false,
          reverse: true,
        },
      },
      {
        id: "gallery-audio-empty",
        kind: "audio",
        label: names.emptyAudio,
        startBar: 10,
        lengthBars: 2,
        sourceId: null,
        gainDb: 0,
      },
    ],
  }
  const tracks: Track[] = [
    {
      ...base,
      id: "ensemble",
      kind: "group",
      name: names.ensemble,
      color: "var(--chart-3)",
      childTrackIds: ["drums", "gallery-audio"],
      clips: [],
    },
    {
      ...base,
      id: "drums",
      kind: "group",
      name: names.drums,
      color: "var(--chart-1)",
      output: "ensemble",
      childTrackIds: ["gallery-pattern"],
      clips: [],
    },
    {
      ...base,
      id: "gallery-pattern",
      kind: "midi",
      name: names.percussion,
      color: "var(--chart-1)",
      output: "drums",
      input: "all",
      inputChannel: "all",
      outputChannel: "none",
      clips: [
        {
          id: "gallery-pattern-clip",
          kind: "pattern",
          label: names.pattern,
          patternId: "gallery-rhythm",
          startBar: 1,
          lengthBars: 4,
        },
        {
          id: "gallery-pattern-empty",
          kind: "pattern",
          label: names.emptyPattern,
          patternId: "gallery-empty-rhythm",
          startBar: 6,
          lengthBars: 2,
        },
      ],
    },
    audio,
    {
      ...base,
      id: "synths",
      kind: "group",
      name: names.synths,
      color: "var(--chart-5)",
      childTrackIds: ["gallery-midi"],
      clips: [],
    },
    {
      ...base,
      id: "gallery-midi",
      kind: "midi",
      name: names.keys,
      color: "var(--chart-5)",
      input: "all",
      inputChannel: "all",
      outputChannel: "none",
      output: "synths",
      armed: true,
      clips: [
        {
          id: "gallery-midi-clip",
          kind: "midi",
          label: names.midi,
          startBar: 1,
          lengthBars: 4,
          loopBars: 4,
          notes: Array.from({ length: 3 }, (_, cycle) =>
            [60, 64, 67, 72].map((pitch, index) => ({
              id: `gallery-note-${cycle}-${index}`,
              pitch,
              startBeat: cycle * 4 + index,
              lengthBeats: index === 0 ? 1.5 : 0.75,
              velocity: 64 + index * 16,
            }))
          ).flat(),
        },
        {
          id: "gallery-midi-empty",
          kind: "midi",
          label: names.emptyMidi,
          startBar: 6,
          lengthBars: 2,
          loopBars: 2,
          notes: [],
        },
      ],
    },
    {
      ...base,
      id: "return-a",
      kind: "return",
      name: names.returnA,
      color: "var(--chart-4)",
      returnPost: true,
      sends: { "return-b": -18 },
      heightPx: 70,
      clips: [],
    },
    {
      ...base,
      id: "return-b",
      kind: "return",
      name: names.returnB,
      color: "var(--chart-3)",
      returnPost: false,
      collapsed: true,
      heightPx: 70,
      sends: {},
      clips: [],
    },
    {
      ...base,
      id: "main",
      kind: "main",
      name: names.main,
      color: "var(--chart-1)",
      output: "external",
      cueOutput: "1-2",
      cueVolumeDb: -12,
      volumeDb: -12,
      sends: {},
      heightPx: 70,
      clips: [],
    },
  ]
  if (kind === "audio" || kind === "automation" || kind === "devices" || kind === "track-editor") {
    tracks.forEach(track => {
      if (track.id !== audio.id) {
        track.collapsed = track.kind !== "group"
        track.heightPx = 70
      }
    })
  }
  if (kind === "piano-roll") {
    tracks.forEach(track => {
      track.collapsed = track.kind !== "group" && track.id !== "gallery-midi"
      track.heightPx = 70
    })
  }
  return {
    document: {
      ...initialDocument(DEFAULT_TRACK_HEIGHT),
      media: [fixtureMediaSource("mock://kick.wav"), fixtureMediaSource("mock://untitled.wav")],
      patterns: [
        {
          id: "gallery-rhythm",
          loopBars: 1,
          notes: [0, 4, 8, 10, 12].map(step => ({
            pitch: 60,
            velocity: 100,
            startBeat: step / 4,
            lengthBeats: 0.25,
          })),
        },
        { id: "gallery-empty-rhythm", loopBars: 2, notes: [] },
      ],
      name: names.project,
      tracks,
      markers: [
        { id: "gallery-intro", bar: 1, label: names.intro },
        { id: "gallery-verse", bar: 5, label: names.verse },
      ],
      transport: {
        ...initialDocument(DEFAULT_TRACK_HEIGHT).transport,
        bpm: 120,
        loop: { enabled: true, startBar: 1, endBar: 9 },
      },
    },
    workspace: {
      ...initialWorkspace(),
      pxPerBar: 80,
      automationMode: kind === "automation",
      scrollX: 0,
      scrollY: 0,
    },
  }
}
