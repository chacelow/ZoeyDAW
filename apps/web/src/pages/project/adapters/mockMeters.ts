import { PATTERN_STEPS_PER_BAR } from "@/pages/project/model/types"
import {
  automationSourceValue,
  automationValueAt,
  normalizedAutomationValue,
} from "@/pages/project/model/automation-curve"
import type {
  BackendAudioClip,
  BackendClipBase,
  BackendMidiClip,
  BackendPatternClip,
  BackendTrack,
} from "@/pages/project/model/backend"

type MeterClipBase = Pick<BackendClipBase, "id" | "startBar" | "lengthBars"> & {
  sourceOffsetBars?: number
}
type MeterClip =
  | (Pick<BackendAudioClip, "kind" | "gainDb"> &
      MeterClipBase & { sourceId?: string | null; waveformPeaks?: readonly number[] })
  | (Pick<BackendMidiClip, "kind" | "notes"> & MeterClipBase & { loopBars?: number })
  | (Pick<BackendPatternClip, "kind"> & MeterClipBase & { steps?: readonly boolean[] })
type MeterTrack = Pick<
  BackendTrack,
  "id" | "kind" | "output" | "solo" | "armed" | "mute" | "volumeDb" | "pan" | "automation"
> & { clips: readonly MeterClip[] }
export interface MeterSignalInput {
  document: { tracks: readonly MeterTrack[]; transport: { numerator: number } }
  session: { playing: boolean; activeMidiNotes: readonly number[] }
}

const SILENCE = -60
const amplitude = (levelDb: number) => 10 ** (levelDb / 20)
const decibels = (value: number) =>
  value > 0 ? Math.max(SILENCE, 20 * Math.log10(value)) : SILENCE

/**
Visual-only deterministic signal. No samples are decoded and no audio is emitted.
*/
export function mockMeterLevels(
  state: MeterSignalInput,
  bar: number,
  now: number
): Record<string, [number, number]> {
  const { tracks } = state.document
  const byId = new Map<string, MeterTrack>(tracks.map(track => [track.id, track]))
  const children = new Map<string, MeterTrack[]>()
  for (const track of tracks) {
    const siblings = children.get(track.output) ?? []
    siblings.push(track)
    children.set(track.output, siblings)
  }
  const soloed = tracks.filter(track => track.solo)
  const signals = new Map<string, [number, number]>()
  const visiting = new Set<string>()

  function hasSoloDescendant(track: MeterTrack): boolean {
    return (children.get(track.id) ?? []).some(child => child.solo || hasSoloDescendant(child))
  }
  function allowed(track: MeterTrack): boolean {
    if (!soloed.length || track.kind === "main" || track.solo || hasSoloDescendant(track)) {
      return true
    }
    let parent = byId.get(track.output)
    while (parent) {
      if (parent.solo) {
        return true
      }
      parent = byId.get(parent.output)
    }
    return false
  }
  function render(track: MeterTrack): [number, number] {
    const cached = signals.get(track.id)
    if (cached) {
      return cached
    }
    if (visiting.has(track.id)) {
      return [0, 0]
    }
    visiting.add(track.id)
    let left = 0
    let right = 0
    const held = track.kind === "midi" && track.armed && state.session.activeMidiNotes.length > 0
    if (held) {
      left += Math.min(0.8, state.session.activeMidiNotes.length * 0.25)
      right += Math.min(0.8, state.session.activeMidiNotes.length * 0.25)
    }
    if (state.session.playing && (track.kind === "audio" || track.kind === "midi")) {
      for (const clip of track.clips) {
        if (bar < clip.startBar || bar >= clip.startBar + clip.lengthBars) {
          continue
        }
        const phase = bar - clip.startBar
        if (clip.kind === "audio") {
          if (clip.sourceId === null) {
            continue
          }
          const peaks = clip.waveformPeaks
          const peak =
            peaks?.[
              Math.min(peaks.length - 1, Math.floor((phase / clip.lengthBars) * peaks.length))
            ] ?? 0.4
          const value = peak * amplitude(clip.gainDb) * (0.4 + 0.2 * Math.abs(Math.sin(now / 180)))
          left += value
          right += value
        } else if (clip.kind === "midi") {
          const cycle = (clip.loopBars ?? clip.lengthBars) * state.document.transport.numerator
          const sourceBeat =
            (phase + (clip.sourceOffsetBars ?? 0)) * state.document.transport.numerator
          const beat = ((sourceBeat % cycle) + cycle) % cycle
          if (
            clip.notes.some(note => {
              const start = ((note.startBeat % cycle) + cycle) % cycle
              return (
                note.lengthBeats >= cycle ||
                (beat >= start && beat < start + note.lengthBeats) ||
                beat < start + note.lengthBeats - cycle
              )
            })
          ) {
            left += 0.55
            right += 0.55
          }
        } else {
          const steps = clip.steps ?? []
          if (
            steps.length &&
            steps[
              ((Math.floor((phase + (clip.sourceOffsetBars ?? 0)) * PATTERN_STEPS_PER_BAR) %
                steps.length) +
                steps.length) %
                steps.length
            ] === true
          ) {
            left += 0.45
            right += 0.45
          }
        }
      }
    }
    for (const child of children.get(track.id) ?? []) {
      const [childLeft, childRight] = render(child)
      left += childLeft
      right += childRight
    }
    const volumeLane = track.automation.find(
      lane => lane.parameter === "volume" && lane.points.length
    )
    const panLane = track.automation.find(lane => lane.parameter === "pan" && lane.points.length)
    const volume = volumeLane
      ? automationSourceValue(
          "volume",
          automationValueAt(
            volumeLane.points,
            bar,
            normalizedAutomationValue("volume", track.volumeDb)
          )
        )
      : track.volumeDb
    const gain = track.mute || !allowed(track) ? 0 : amplitude(volume)
    const pan = panLane
      ? automationSourceValue(
          "pan",
          automationValueAt(panLane.points, bar, normalizedAutomationValue("pan", track.pan))
        )
      : Math.max(-1, Math.min(1, track.pan))
    const result: [number, number] = [
      left * gain * (pan > 0 ? 1 - pan : 1),
      right * gain * (pan < 0 ? 1 + pan : 1),
    ]
    visiting.delete(track.id)
    signals.set(track.id, result)
    return result
  }
  const levels: Record<string, [number, number]> = {}
  for (const track of tracks) {
    const [left, right] = render(track)
    levels[track.id] = [decibels(left), decibels(right)]
  }
  return levels
}
