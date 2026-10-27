import { defaultAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { insertClips } from "@zoeydaw/project-core/clip-edits"
import { createTrack } from "@zoeydaw/project-core/reducers"
import { projectTempoSections, secondsAtBar } from "@zoeydaw/project-core/tempo-map"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import type { AudioClip, DocumentState } from "@zoeydaw/project-core/types"
import type { NativeRecording } from "@/shared/native/audio"

export function applyRecording(document: DocumentState, recording: NativeRecording): DocumentState {
  for (const source of recording.sources) {
    const existing = document.media.find(item => item.id === source.id)
    if (
      existing &&
      (existing.sha256 !== source.sha256 ||
        existing.frames !== source.frames ||
        existing.sampleRate !== source.sampleRate ||
        existing.channels !== source.channels ||
        existing.byteLength !== source.byteLength)
    ) {
      throw new Error("Recorded media identity conflicts with the current project")
    }
  }
  // Files are recording-owned identities; their atomic insertion is the durable replay marker.
  if (recording.sources.every(source => document.media.some(item => item.id === source.id))) {
    return document
  }
  if (recording.recovery) {
    const tracks = [...document.tracks]
    for (const placement of recording.clips) {
      if (tracks.some(track => track.id === placement.trackId)) continue
      const track = createTrack("audio", tracks, undefined, DEFAULT_TRACK_HEIGHT)
      track.id = placement.trackId
      track.name =
        recording.sources.find(source => source.id === placement.fileId)?.name ??
        recording.recordingId
      track.input = "none"
      track.monitor = "off"
      const firstBus = tracks.findIndex(item => item.kind === "return" || item.kind === "main")
      tracks.splice(firstBus === -1 ? tracks.length : firstBus, 0, track)
    }
    document = { ...document, tracks }
  }
  const incoming = new Map<string, AudioClip[]>()
  const timebase = {
    ...document.transport,
    tempo: projectTempoSections(document.tracks, document.transport),
  }
  for (const placement of recording.clips) {
    const track = document.tracks.find(item => item.id === placement.trackId)
    if (!track || track.kind !== "audio") {
      throw new Error("The recorded audio destination no longer exists")
    }
    const source = recording.sources.find(item => item.id === placement.fileId)
    if (!source) throw new Error("Recorded clip has no inspected audio source")
    const existing = document.tracks
      .flatMap(item => item.clips)
      .find(clip => clip.id === placement.clipId)
    if (existing) throw new Error("Recorded clip identity conflicts with the current project")
    const durationBars =
      ((source.frames / source.sampleRate) * recording.sourceBpm) /
      ((60 * document.transport.numerator * 4) / document.transport.denominator)
    const clip: AudioClip = {
      id: placement.clipId,
      kind: "audio",
      sourceId: source.id,
      label: source.name,
      startBar: placement.startBar,
      lengthBars: placement.durationBars,
      sourceOffsetBars: placement.sourceOffsetBars,
      gainDb: 0,
      audioSettings: {
        ...defaultAudioClipSettings(recording.sourceBpm, { lengthBars: durationBars }),
        warp: false,
        loop: false,
        startMarkerBars: placement.sourceOffsetBars,
        endMarkerBars:
          placement.sourceOffsetBars +
          ((secondsAtBar(timebase, placement.startBar + placement.durationBars) -
            secondsAtBar(timebase, placement.startBar)) *
            recording.sourceBpm *
            document.transport.denominator) /
            (240 * document.transport.numerator),
      },
    }
    const clips = incoming.get(track.id) ?? []
    clips.push(clip)
    incoming.set(track.id, clips)
  }
  return {
    ...document,
    media: [
      ...document.media,
      ...recording.sources.filter(
        source => !document.media.some(existing => existing.id === source.id)
      ),
    ],
    tracks: document.tracks.map(track => {
      const clips = incoming.get(track.id)
      return clips
        ? {
            ...track,
            clips: insertClips(
              track.clips,
              clips,
              key => `recording:${recording.recordingId}:${key}`,
              document.transport.bpm
            ),
          }
        : track
    }),
  }
}
