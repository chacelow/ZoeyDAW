import { findMediaSource } from "./media"
import type { MediaSource } from "./media"
import type { Clip } from "./types"

export function clipLabel(clip: Clip, media: readonly MediaSource[]): string {
  if (clip.label) {
    return clip.label
  }
  if (clip.kind === "audio") {
    return findMediaSource(media, clip.sourceId)?.name || "Audio Clip"
  }
  return clip.kind === "pattern" ? "Pattern" : "MIDI Clip"
}
