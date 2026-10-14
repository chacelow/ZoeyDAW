/**
 * Demo tracks and Clips for this slice. There is no project store or
 * adapter yet (that is a separate architecture decision, see
 * shared/model/types.ts); this is fixture data to prove the rendering,
 * drag and resize behavior, spread far enough along the bar axis that the
 * visible window only ever covers a fraction of it.
 *
 * `color` holds a theme chart-token key instead of a literal color string:
 * resolving it to an actual value happens in the component layer via
 * `useTheme()`, per this project's "no colors.ts outside ThemeProvider" rule.
 */
import type { Clip, Track } from "../../../shared/model/types"

export type TrackColorToken = "chart1" | "chart2" | "chart3" | "chart4" | "chart5"

export interface DemoTrack extends Omit<Track, "color"> {
  color: TrackColorToken
}

function demoTrack(
  partial: Pick<DemoTrack, "id" | "name" | "kind" | "color" | "clips">
): DemoTrack {
  return {
    ...partial,
    solo: false,
    armed: false,
    mute: false,
    volumeDb: 0,
    pan: 0,
    heightPx: 70,
    automation: [],
  }
}

export function createDemoTracks(): DemoTrack[] {
  const drumClips: Clip[] = [
    {
      id: "clip-drums-1",
      kind: "audio",
      startBar: 0,
      lengthBars: 4,
      label: "Kick Loop",
      samplePath: "demo/kick.wav",
      gainDb: 0,
    },
    {
      id: "clip-drums-2",
      kind: "audio",
      startBar: 8,
      lengthBars: 8,
      label: "Break",
      samplePath: "demo/break.wav",
      gainDb: 0,
    },
    {
      id: "clip-drums-3",
      kind: "audio",
      startBar: 40,
      lengthBars: 4,
      samplePath: "demo/drums-3.wav",
      gainDb: 0,
    },
    {
      id: "clip-drums-4",
      kind: "audio",
      startBar: 120,
      lengthBars: 8,
      label: "Outro Fill",
      samplePath: "demo/outro.wav",
      gainDb: 0,
    },
  ]
  const bassClips: Clip[] = [
    { id: "clip-bass-1", kind: "midi", startBar: 4, lengthBars: 8, label: "Verse Bass", notes: [] },
    {
      id: "clip-bass-2",
      kind: "midi",
      startBar: 16,
      lengthBars: 16,
      label: "Chorus Bass",
      notes: [],
    },
    { id: "clip-bass-3", kind: "midi", startBar: 100, lengthBars: 12, notes: [] },
  ]
  const keyClips: Clip[] = [
    {
      id: "clip-keys-1",
      kind: "pattern",
      startBar: 0,
      lengthBars: 8,
      label: "Chord Stabs",
      patternId: "pattern-stabs",
    },
    { id: "clip-keys-2", kind: "pattern", startBar: 24, lengthBars: 4, patternId: "pattern-fill" },
    {
      id: "clip-keys-3",
      kind: "midi",
      startBar: 64,
      lengthBars: 16,
      label: "Lead Line",
      notes: [],
    },
  ]
  const fxClips: Clip[] = [
    {
      id: "clip-fx-1",
      kind: "audio",
      startBar: 32,
      lengthBars: 2,
      label: "Riser",
      samplePath: "demo/riser.wav",
      gainDb: 0,
    },
    {
      id: "clip-fx-2",
      kind: "audio",
      startBar: 60,
      lengthBars: 1,
      samplePath: "demo/fx-2.wav",
      gainDb: 0,
    },
    {
      id: "clip-fx-3",
      kind: "audio",
      startBar: 150,
      lengthBars: 3,
      label: "Impact",
      samplePath: "demo/impact.wav",
      gainDb: 0,
    },
  ]

  return [
    demoTrack({
      id: "track-drums",
      name: "Drums",
      kind: "audio",
      color: "chart1",
      clips: drumClips,
    }),
    demoTrack({ id: "track-bass", name: "Bass", kind: "midi", color: "chart2", clips: bassClips }),
    demoTrack({ id: "track-keys", name: "Keys", kind: "midi", color: "chart3", clips: keyClips }),
    demoTrack({ id: "track-fx", name: "FX", kind: "audio", color: "chart4", clips: fxClips }),
  ]
}
