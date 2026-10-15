import { canRouteTrack } from "../../model/track-routing"
import type { Track } from "../../model/types"

export function routeTrack(
  source: readonly Track[],
  id: string,
  patch: Partial<Track>
): Track[] | null {
  const target = source.find(track => track.id === id)
  if (!target) {
    return null
  }
  if (patch.output !== undefined && patch.output !== target.output) {
    if (!canRouteTrack(id, patch.output, source)) return null
    return source.map(track => {
      if (track.id === id) {
        return { ...track, ...structuredClone(patch), id: track.id, kind: track.kind }
      }
      if (track.id === target.output && track.kind === "group") {
        return { ...track, childTrackIds: track.childTrackIds?.filter(child => child !== id) }
      }
      return track.id === patch.output && track.kind === "group"
        ? { ...track, childTrackIds: [...(track.childTrackIds ?? []), id] }
        : track
    })
  }
  return source.map(track =>
    track.id === id
      ? { ...track, ...structuredClone(patch), id: track.id, kind: track.kind }
      : track
  )
}
