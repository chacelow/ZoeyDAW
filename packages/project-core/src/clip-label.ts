import { findMediaSource } from "./media"
import type { MediaSource } from "./media"
import type { ClipContent } from "./types"

export function clipLabel(clip: ClipContent, media: readonly MediaSource[]): string {
  if (clip.label) {
    return clip.label
  }
  if (clip.kind === "audio") {
    return findMediaSource(media, clip.sourceId)?.name || "Audio Clip"
  }
  return clip.kind === "pattern" ? "Pattern" : "MIDI Clip"
}
