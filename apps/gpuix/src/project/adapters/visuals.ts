import { mockWaveformPeaks } from "./fixtures"
import type { AudioClip } from "../model/types"

/**
Frontend-only visualization of the visible mock source window.
*/
export function withWaveformPreview(clip: AudioClip): AudioClip {
  return {
    ...clip,
    waveformPeaks: mockWaveformPeaks(clip.samplePath, clip.sourceOffsetBars ?? 0, clip.lengthBars),
  }
}
