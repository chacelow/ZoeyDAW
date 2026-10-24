import { acceptsClip } from "./types"
import type { Track } from "./types"

export function canAcceptAudioDrop(track: Pick<Track, "kind">): boolean {
  return acceptsClip(track.kind, "audio") || track.kind === "midi"
}
