import type { DocumentState } from "@/pages/project/model/types"

/**
An empty authored project; demo tracks and clips are supplied only by the mock adapter.
*/
export function initialDocument(): DocumentState {
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
    tracks: [
      {
        id: "main",
        name: "Main",
        kind: "main",
        color: "var(--chart-3)",
        solo: false,
        armed: false,
        mute: false,
        volumeDb: 0,
        pan: 0,
        input: "none",
        output: "external",
        outputChannel: "1-2",
        cueOutput: "1-2",
        cueVolumeDb: 0,
        sends: {},
        clips: [],
        heightPx: 108,
        monitor: "auto",
        automation: [],
      },
    ],
    markers: [],
  }
}
