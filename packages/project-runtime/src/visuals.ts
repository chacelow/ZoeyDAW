import { mockWaveformPeaks } from "./testing/fixtures"
import type { AudioClip } from "@zoeydaw/project-core/types"
import { findMediaSource } from "@zoeydaw/project-core/media"
import type { MediaSource } from "@zoeydaw/project-core/media"

/**
Frontend-only visualization of the visible mock source window.
*/
export function withWaveformPreview(clip: AudioClip, media: readonly MediaSource[]): AudioClip {
  const source = findMediaSource(media, clip.sourceId)
  return {
    ...clip,
    waveformPeaks:
      source?.location.kind === "fixture"
        ? mockWaveformPeaks(source.location.uri, clip.sourceOffsetBars ?? 0, clip.lengthBars)
        : undefined,
  }
}
