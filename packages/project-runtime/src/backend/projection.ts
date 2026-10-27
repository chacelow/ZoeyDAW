import type {
  BackendClip,
  BackendClipContent,
  BackendProject,
  BackendTrack,
} from "@zoeydaw/project-core/backend"
import { DEFAULT_FADE_CURVE } from "@zoeydaw/project-core/fades"
import { resolveMediaUri } from "@zoeydaw/project-core/media"
import { getAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import { projectTempoSections } from "@zoeydaw/project-core/tempo-map"
import type { Clip, ClipContent, DocumentState } from "@zoeydaw/project-core/types"

function projectClip(authored: Clip, document: DocumentState, sourceIds: Set<string>): BackendClip
function projectClip(
  authored: ClipContent,
  document: DocumentState,
  sourceIds: Set<string>
): BackendClipContent
function projectClip(
  authored: ClipContent,
  document: DocumentState,
  sourceIds: Set<string>
): BackendClipContent {
  const clip = authored.kind === "pattern" ? resolveMidiClip(authored, document.patterns) : authored
  const base = {
    id: clip.id,
    ...("startBar" in clip && typeof clip.startBar === "number" ? { startBar: clip.startBar } : {}),
    lengthBars: clip.lengthBars,
    sourceOffsetBars: clip.sourceOffsetBars ?? 0,
    mute: clip.mute === true,
  }
  if (clip.kind === "audio") {
    if (clip.sourceId !== null) sourceIds.add(clip.sourceId)
    return {
      ...base,
      kind: "audio",
      sourceId: clip.sourceId,
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
  return {
    ...base,
    kind: "midi",
    loopBars: clip.loopBars ?? clip.lengthBars,
    notes: clip.notes.map(note => ({
      id: note.id,
      pitch: note.pitch,
      startBeat: note.startBeat,
      lengthBeats: note.lengthBeats,
      velocity: note.velocity,
    })),
  }
}

export function projectBackendDocument(document: DocumentState): BackendProject {
  const sourceIds = new Set<string>()
  const tracks: BackendTrack[] = document.tracks.map(track => ({
    id: track.id,
    kind: track.kind,
    childTrackIds: [...(track.childTrackIds ?? [])],
    input: track.input,
    output: track.output,
    inputChannel:
      track.inputChannel ?? (track.kind === "audio" && track.input === "external" ? "1" : null),
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
    clips: track.clips.map(clip => projectClip(clip, document, sourceIds)),
    ...(track.clipSlots === undefined
      ? {}
      : {
          clipSlots: track.clipSlots.map(slot => ({
            sceneId: slot.sceneId,
            clip: projectClip(slot.clip, document, sourceIds),
          })),
        }),
  }))
  const { bpm, numerator, denominator, loop } = document.transport
  const tempo = projectTempoSections(document.tracks, document.transport)
  return {
    bpm,
    numerator,
    denominator,
    ...(tempo.length ? { tempo } : {}),
    loop: { ...loop },
    tracks,
    ...(document.launcher.scenes.length
      ? {
          launcher: {
            scenes: document.launcher.scenes.map(scene => ({ id: scene.id })),
            quantization: document.launcher.quantization,
          },
        }
      : {}),
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
