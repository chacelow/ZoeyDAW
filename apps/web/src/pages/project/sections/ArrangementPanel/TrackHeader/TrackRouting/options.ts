import type { Track } from "@zoeydaw/project-core/types"

export interface RouteOption {
  id: string
  label: string
}

function canRouteTo(source: Track, destination: Track, tracks: readonly Track[]): boolean {
  if (destination.kind !== "main" && destination.kind !== "group") return false
  const visited = new Set([source.id])
  let target: Track | undefined = destination
  while (target) {
    if (visited.has(target.id)) return false
    visited.add(target.id)
    const output: Track["output"] = target.output
    target = tracks.find(candidate => candidate.id === output)
  }
  return true
}

export function trackOutputOptions(track: Track, tracks: readonly Track[]): RouteOption[] {
  return tracks
    .filter(candidate => canRouteTo(track, candidate, tracks))
    .map(candidate => ({ id: candidate.id, label: candidate.name }))
}

export function hardwareChannelOptions(
  stereo: readonly number[] = [],
  mono: readonly number[] = []
): RouteOption[] {
  return [
    ...stereo.map(index => ({
      id: `${index + 1}-${index + 2}`,
      label: `${index + 1} / ${index + 2}`,
    })),
    ...mono.map(index => ({ id: String(index + 1), label: String(index + 1) })),
  ]
}

export const midiChannelOptions = Array.from({ length: 16 }, (_, index) => ({
  id: String(index + 1),
  label: String(index + 1),
}))

export function inputChannelOptions(
  track: Track,
  hardwareInputs: RouteOption[],
  allChannelsLabel: string
): RouteOption[] {
  if (track.input === "none") return [{ id: "", label: "" }]
  if (track.kind === "midi") {
    return [{ id: "all", label: allChannelsLabel }, ...midiChannelOptions]
  }
  return hardwareInputs
}

export function inputChannelValue(track: Track): string {
  if (track.input === "none") return ""
  return track.inputChannel ?? (track.kind === "midi" ? "all" : "1")
}

export function outputChannelValue(track: Track): string {
  if (track.output === "external" && track.kind === "midi") return track.outputChannel ?? "1"
  return track.outputChannel ?? "1-2"
}
