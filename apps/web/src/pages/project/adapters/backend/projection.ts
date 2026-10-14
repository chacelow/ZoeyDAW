import type {
  BackendClip,
  BackendProject,
  BackendSource,
  BackendTrack,
} from "@/pages/project/model/backend"
import { DEFAULT_FADE_CURVE } from "@/pages/project/model/fades"
import type { DocumentState } from "@/pages/project/model/types"

export function projectBackendDocument(document: DocumentState): BackendProject {
  const sources: BackendSource[] = []
  const sourceIds = new Set<string>()
  const tracks: BackendTrack[] = document.tracks.map(track => ({
    id: track.id,
    kind: track.kind,
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
    automation: track.automation.map(lane => ({
      id: lane.id,
      parameter: lane.parameter,
      points: lane.points.map(point => ({
        id: point.id,
        bar: point.bar,
        value: point.value,
        ...(point.curve === undefined ? {} : { curve: point.curve }),
      })),
    })),
    clips: track.clips.map((clip): BackendClip => {
      const base = {
        id: clip.id,
        startBar: clip.startBar,
        lengthBars: clip.lengthBars,
        sourceOffsetBars: clip.sourceOffsetBars ?? 0,
      }
      switch (clip.kind) {
        case "audio": {
          const sourceId = clip.samplePath || null
          if (sourceId !== null && !sourceIds.has(sourceId)) {
            sourceIds.add(sourceId)
            sources.push({ id: sourceId, uri: clip.samplePath })
          }
          return {
            ...base,
            kind: "audio",
            sourceId,
            gainDb: clip.gainDb,
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
        case "pattern":
          return { ...base, kind: "pattern", steps: [...(clip.steps ?? [])] }
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
    sources,
  }
}
