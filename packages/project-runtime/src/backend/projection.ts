import type { BackendClip, BackendProject, BackendTrack } from "@zoeydaw/project-core/backend"
import { DEFAULT_FADE_CURVE } from "@zoeydaw/project-core/fades"
import { resolveMediaUri } from "@zoeydaw/project-core/media"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import type { DocumentState } from "@zoeydaw/project-core/types"

export function projectBackendDocument(document: DocumentState): BackendProject {
  const sourceIds = new Set<string>()
  const tracks: BackendTrack[] = document.tracks.map(track => ({
    id: track.id,
    kind: track.kind,
    childTrackIds: [...(track.childTrackIds ?? [])],
    input: track.input,
    output: track.output,
    inputChannel: track.inputChannel ?? null,
    outputChannel: track.outputChannel ?? null,
    monitor: track.monitor,
    volumeDb: track.volumeDb,
    pan: track.pan,
    mute: track.mute,
    solo: track.solo,
    armed: track.armed,
    sends: { ...track.sends },
    returnPost: track.returnPost ?? false,
    cueOutput: track.cueOutput ?? null,
    cueVolumeDb: track.cueVolumeDb ?? 0,
    devices: (track.devices ?? []).map(({ collapsed: _collapsed, ...device }) => device),
    automation: track.automation.map(lane => ({
      id: lane.id,
      target: { ...lane.target },
      points: lane.points.map(point => ({
        id: point.id,
        bar: point.bar,
        value: point.value,
        ...(point.curve === undefined ? {} : { curve: point.curve }),
      })),
    })),
    clips: track.clips.map((authored): BackendClip => {
      const clip =
        authored.kind === "pattern" ? resolveMidiClip(authored, document.patterns) : authored
      const base = {
        id: clip.id,
        startBar: clip.startBar,
        lengthBars: clip.lengthBars,
        sourceOffsetBars: clip.sourceOffsetBars ?? 0,
        mute: clip.mute === true,
      }
      switch (clip.kind) {
        case "audio": {
          const sourceId = clip.sourceId
          if (sourceId !== null) sourceIds.add(sourceId)
          return {
            ...base,
            kind: "audio",
            sourceId,
            gainDb: clip.gainDb,
            audioSettings: { ...getAudioClipSettings(clip, document.transport.bpm) },
            fadeInBars: clip.fadeInBars ?? 0,
            fadeOutBars: clip.fadeOutBars ?? 0,
            fadeInOffsetBars: clip.fadeInOffsetBars ?? 0,
            fadeOutOffsetBars: clip.fadeOutOffsetBars ?? 0,
            fadeInCurve: clip.fadeInCurve ?? DEFAULT_FADE_CURVE,
            fadeOutCurve: clip.fadeOutCurve ?? DEFAULT_FADE_CURVE,
            fadeInCurvePosition: clip.fadeInCurvePosition ?? 0.5,
            fadeOutCurvePosition: clip.fadeOutCurvePosition ?? 0.5,
          }
        }
        case "midi":
          return {
            ...base,
            kind: "midi",
            notes: clip.notes.map(note => ({
              id: note.id,
              pitch: note.pitch,
              startBeat: note.startBeat,
              lengthBeats: note.lengthBeats,
              velocity: note.velocity,
            })),
            loopBars: clip.loopBars ?? clip.lengthBars,
          }
        default: {
          const impossible: never = clip
          throw new Error(`Unsupported clip kind: ${String(impossible)}`)
        }
      }
    }),
  }))
  const { bpm, numerator, denominator, loop } = document.transport
  return {
    bpm,
    numerator,
    denominator,
    loop: { ...loop },
    tracks,
    sources: document.media
      .filter(source => sourceIds.has(source.id))
      .map(source => ({
        id: source.id,
        uri: resolveMediaUri(source),
        sha256: source.sha256,
        frames: source.frames,
        sampleRate: source.sampleRate,
        channels: source.channels,
      })),
  }
}
