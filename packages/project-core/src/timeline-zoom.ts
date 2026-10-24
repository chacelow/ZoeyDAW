import { gridZoomLimit } from "./grid"
import type { MediaSource } from "./media"
import type { DocumentState } from "./types"

export function timelineZoomLimit(
  transport: Pick<DocumentState["transport"], "bpm" | "numerator" | "denominator">,
  media: readonly MediaSource[]
): number {
  let sampleRate = 0
  for (const source of media) sampleRate = Math.max(sampleRate, source.sampleRate)
  const secondsPerBar = (240 * transport.numerator) / (transport.bpm * transport.denominator)
  return Math.max(
    gridZoomLimit(transport.numerator, transport.denominator),
    32 * sampleRate * secondsPerBar
  )
}
