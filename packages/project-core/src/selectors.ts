import type { DocumentState } from "./types"

export function growTimelineBars(
  baseBars: number,
  throughBar: number,
  quarterNotesPerBar = 4
): number {
  const minimum = 232 / quarterNotesPerBar
  if (!Number.isFinite(throughBar)) return Math.max(minimum, baseBars)
  const candidate =
    Math.min(15768000, Math.max(232, (throughBar - 1) * quarterNotesPerBar + 32)) /
    quarterNotesPerBar
  return candidate > baseBars - 32 / quarterNotesPerBar &&
    candidate < baseBars + 16 / quarterNotesPerBar
    ? baseBars
    : candidate
}

export function timelineBars(document: DocumentState): number {
  let throughBar = document.transport.loop.endBar
  for (const marker of document.markers) throughBar = Math.max(throughBar, marker.bar)
  for (const track of document.tracks) {
    for (const clip of track.clips)
      throughBar = Math.max(throughBar, clip.startBar + clip.lengthBars)
    for (const lane of track.automation) {
      for (const point of lane.points) throughBar = Math.max(throughBar, point.bar)
    }
  }
  const quarterNotesPerBar = (document.transport.numerator * 4) / document.transport.denominator
  return growTimelineBars(200 / quarterNotesPerBar, throughBar, quarterNotesPerBar)
}
