import { hydrateProject, useProjectState } from "@/project/adapters"
import { defaultAudioClipSettings } from "@/project/model/audio-editor"
import { createClip, createTrack } from "@/project/model/reducers"
import { DEFAULT_TRACK_HEIGHT } from "@/project/layout"
import { CONTENT_PALETTE } from "@/shared/theme/content-color"
import type { Track } from "@/project/model/types"

/** One MIDI, one Audio (real generated WAV) and one Pattern clip; returns their ids. */
export function seedClipEditProject(mediaUri: string, workload: "normal" | "dense") {
  const current = useProjectState.getState()
  const document = structuredClone(current.document)
  const main = document.tracks.find(track => track.kind === "main")
  if (!main) throw new Error("Verification project requires the existing Main output")
  document.name = "Clip editor verification"
  document.transport = { ...document.transport, bpm: 120, numerator: 4, denominator: 4 }
  main.volumeDb = -30
  const tracks: Track[] = []
  const midiTrack = createTrack("midi", tracks, undefined, DEFAULT_TRACK_HEIGHT)
  midiTrack.color = CONTENT_PALETTE[1]
  const midi = createClip("midi", 1, 2)
  if (midi.kind !== "midi") throw new Error("Expected a MIDI clip")
  midi.label = "Chords"
  midi.loopBars = 2
  midi.notes = [
    ...[60, 64, 67].map((pitch, index) => ({
      id: `c-${index}`,
      pitch,
      startBeat: 0,
      lengthBeats: 2,
      velocity: 96,
    })),
    ...[57, 60, 64].map((pitch, index) => ({
      id: `a-${index}`,
      pitch,
      startBeat: 2,
      lengthBeats: 2,
      velocity: 72,
    })),
    ...[53, 57, 60].map((pitch, index) => ({
      id: `f-${index}`,
      pitch,
      startBeat: 4,
      lengthBeats: 2,
      velocity: 84,
    })),
    ...[55, 59, 62].map((pitch, index) => ({
      id: `g-${index}`,
      pitch,
      startBeat: 6,
      lengthBeats: 1.5,
      velocity: 110,
    })),
    { id: "lead", pitch: 72, startBeat: 6.25, lengthBeats: 0.25, velocity: 50 },
  ]
  const pattern = createClip("pattern", 3, 1)
  if (pattern.kind !== "pattern") throw new Error("Expected a Pattern clip")
  pattern.label = "Hats"
  pattern.steps = Array.from({ length: 16 }, (_, index) => index % 4 === 2)
  if (workload === "dense") {
    midi.lengthBars = 16
    midi.loopBars = 16
    midi.notes = Array.from({ length: 10_000 }, (_, index) => ({
      id: `dense-${index}`,
      pitch: 36 + (index % 50),
      startBeat: Math.floor(index / 50) * 0.32,
      lengthBeats: 0.24,
      velocity: 1 + (index % 127),
    }))
    pattern.lengthBars = 64
    pattern.steps = Array.from({ length: 1024 }, (_, index) => index % 4 === 2)
  }
  midiTrack.clips = [midi, pattern]
  tracks.push(midiTrack)
  const audioTrack = createTrack("audio", tracks, undefined, DEFAULT_TRACK_HEIGHT)
  audioTrack.color = CONTENT_PALETTE[0]
  audioTrack.output = "main"
  audioTrack.volumeDb = -30
  const audio = createClip("audio", 1, 4)
  if (audio.kind !== "audio") throw new Error("Expected an Audio clip")
  audio.label = "Stereo tone"
  audio.samplePath = mediaUri
  audio.gainDb = -3
  audio.sourceOffsetBars = 0.25
  audio.fadeInBars = 0.5
  audio.fadeOutBars = 0.75
  audio.audioSettings = defaultAudioClipSettings(120, { sourceOffsetBars: 0.25, lengthBars: 4 })
  audioTrack.clips = [audio]
  tracks.push(audioTrack)
  document.tracks = [...tracks, main]
  hydrateProject(JSON.stringify({ version: 2, document, workspace: current.workspace }))
  return { midi: midi.id, audio: audio.id, pattern: pattern.id }
}
