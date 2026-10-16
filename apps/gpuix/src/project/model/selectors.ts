import { PROJECT_TEMPLATE } from "../defaults/template"
import type { DocumentState } from "./types"

export function growTimelineBars(
  baseBars: number,
  throughBar: number,
  policy = PROJECT_TEMPLATE.timeline
): number {
  if (!Number.isFinite(throughBar) || throughBar <= 1) {
    return Math.max(policy.minimumBars, baseBars)
  }
  const { minimumBars, growthStepBars, paddingBars } = policy
  const rounded = Math.ceil((throughBar - 1) / growthStepBars) * growthStepBars + paddingBars
  return Math.max(minimumBars, baseBars, Number.isFinite(rounded) ? rounded : throughBar)
}

export function timelineBars(document: DocumentState, policy = PROJECT_TEMPLATE.timeline): number {
  let throughBar = document.transport.loop.endBar
  for (const marker of document.markers) {
    throughBar = Math.max(throughBar, marker.bar)
  }
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      throughBar = Math.max(throughBar, clip.startBar + clip.lengthBars)
    }
    for (const lane of track.automation) {
      for (const point of lane.points) {
        throughBar = Math.max(throughBar, point.bar)
      }
    }
  }
  return growTimelineBars(policy.minimumBars, throughBar, policy)
}
