import type { TempoTimebase } from "./tempo-map"
import { gridZoomLimit } from "./grid"
import type { MediaSource } from "./media"

export function timelineZoomLimit(transport: TempoTimebase, media: readonly MediaSource[]): number {
  let sampleRate = 0
  for (const source of media) sampleRate = Math.max(sampleRate, source.sampleRate)
  const minimumBpm = Math.min(transport.bpm, ...(transport.tempo ?? []).map(section => section.bpm))
  const secondsPerBar = (240 * transport.numerator) / (minimumBpm * transport.denominator)
  return Math.max(
    gridZoomLimit(transport.numerator, transport.denominator),
    32 * sampleRate * secondsPerBar
  )
}
