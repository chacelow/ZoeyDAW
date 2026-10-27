import { acceptsClip } from "./types"
import type { Track } from "./types"

export function canAcceptAudioDrop(
  track: Pick<Track, "kind"> & Partial<Pick<Track, "devices">>
): boolean {
  return (
    acceptsClip(track.kind, "audio") ||
    (track.kind === "midi" &&
      !(track.devices ?? []).some(
        device => device.kind === "external" && device.plugin.role === "instrument"
      ))
  )
}
