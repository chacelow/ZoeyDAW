import { automationValueAt, automationSourceValue } from "./automation-curve"
import type { AutomationPoint, Track, AudioClipContent } from "./types"
import { getAudioClipSettings } from "./audio-editor/settings"

export interface TempoSection {
  readonly bar: number
  readonly bpm: number
}
export interface TempoTimebase {
  readonly bpm: number
  readonly numerator: number
  readonly denominator: number
  readonly tempo?: readonly TempoSection[]
}
const target = { kind: "mixer", parameter: "tempo" } as const
const EMPTY_TEMPO: readonly TempoSection[] = []
const maps = new WeakMap<readonly AutomationPoint[], Map<string, readonly TempoSection[]>>()

export function projectTempoSections(
  tracks: readonly Track[],
  transport: TempoTimebase
): readonly TempoSection[] {
  const points = tracks
    .find(track => track.kind === "main")
    ?.automation.find(
      lane => lane.target.kind === "mixer" && lane.target.parameter === "tempo"
    )?.points
  if (!points?.length) return EMPTY_TEMPO
  const key = `${transport.numerator}/${transport.denominator}`
  const existing = maps.get(points)?.get(key)
  if (existing) return existing
  const sections: TempoSection[] = [{ bar: 1, bpm: automationSourceValue(target, points[0].value) }]
  for (let index = 0; index < points.length; index++) {
    const left = points[index],
      right = points[index + 1]
    const count = right
      ? Math.max(
          1,
          Math.min(
            100,
            Math.floor(
              (4 * (right.bar - left.bar) * transport.numerator * 4) / transport.denominator
            )
          )
        )
      : 1
    for (let step = 0; step < count; step++) {
      const bar = right ? left.bar + ((right.bar - left.bar) * step) / count : left.bar
      const bpm = automationSourceValue(target, automationValueAt(points, bar, left.value))
      if (bar === 1) sections[0] = { bar, bpm }
      else sections.push({ bar, bpm })
      if (sections.length > 65536) throw new Error("Song tempo automation exceeds section capacity")
    }
  }
  const cache = maps.get(points) ?? new Map<string, readonly TempoSection[]>()
  cache.set(key, sections)
  maps.set(points, cache)
  return sections
}

export function tempoAtBar(transport: TempoTimebase, bar: number): number {
  let bpm = transport.tempo?.[0]?.bpm ?? transport.bpm
  for (const section of transport.tempo ?? []) {
    if (section.bar > bar) break
    bpm = section.bpm
  }
  return bpm
}
export function secondsAtBar(transport: TempoTimebase, bar: number): number {
  const factor = (transport.numerator * 240) / transport.denominator
  let position = 1,
    seconds = 0,
    bpm = transport.tempo?.[0]?.bpm ?? transport.bpm
  for (const section of transport.tempo ?? []) {
    if (section.bar >= bar) break
    seconds += ((section.bar - position) * factor) / bpm
    position = section.bar
    bpm = section.bpm
  }
  return seconds + ((bar - position) * factor) / bpm
}
export function barAtSeconds(transport: TempoTimebase, seconds: number): number {
  const factor = (transport.numerator * 240) / transport.denominator
  let position = 1,
    elapsed = 0,
    bpm = transport.tempo?.[0]?.bpm ?? transport.bpm
  for (const section of transport.tempo ?? []) {
    const next = elapsed + ((section.bar - position) * factor) / bpm
    if (next > seconds) break
    elapsed = next
    position = section.bar
    bpm = section.bpm
  }
  return position + ((seconds - elapsed) * bpm) / factor
}

export function clipSourceCoordinate(
  clip: AudioClipContent,
  timebase: TempoTimebase,
  localBar: number
): number {
  const settings = getAudioClipSettings(clip, timebase.bpm)
  const offset = clip.sourceOffsetBars ?? 0
  const origin = offset < 0 ? offset : Math.max(offset, settings.startMarkerBars)
  if (settings.warp) return origin + localBar
  const start = "startBar" in clip && typeof clip.startBar === "number" ? clip.startBar : 1
  const elapsed = secondsAtBar(timebase, start + localBar) - secondsAtBar(timebase, start)
  return origin + (elapsed * settings.sourceBpm * timebase.denominator) / (240 * timebase.numerator)
}

export function clipBarAtSourceCoordinate(
  clip: AudioClipContent,
  timebase: TempoTimebase,
  coordinate: number
): number {
  const settings = getAudioClipSettings(clip, timebase.bpm)
  const origin = clipSourceCoordinate(clip, timebase, 0)
  if (settings.warp) return coordinate - origin
  const start = "startBar" in clip && typeof clip.startBar === "number" ? clip.startBar : 1
  const elapsed =
    ((coordinate - origin) * 240 * timebase.numerator) / (settings.sourceBpm * timebase.denominator)
  return barAtSeconds(timebase, secondsAtBar(timebase, start) + elapsed) - start
}
