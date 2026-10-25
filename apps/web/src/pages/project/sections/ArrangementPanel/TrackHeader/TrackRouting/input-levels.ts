import type { Track } from "@zoeydaw/project-core/types"

export function usesGhostInputMeter(track: Track): boolean {
  return (
    track.kind === "audio" && track.input === "external" && track.armed && track.monitor === "off"
  )
}

export function usesLiveInputMeter(track: Track, playing: boolean): boolean {
  return (
    track.kind === "audio" &&
    track.input === "external" &&
    !playing &&
    (track.monitor === "in" || (track.monitor === "auto" && track.armed))
  )
}
