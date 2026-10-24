import type { Track } from "@zoeydaw/project-core/types"

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
    if (
      patch.output === id ||
      (patch.output !== "none" &&
        patch.output !== "external" &&
        source.every(
          track => !(track.id === patch.output && (track.kind === "group" || track.kind === "main"))
        ))
    ) {
      return null
    }
    const descendants = new Set<string>()
    const collect = (parentId: string): void => {
      for (const child of source.find(track => track.id === parentId)?.childTrackIds ?? []) {
        descendants.add(child)
        collect(child)
      }
    }
    collect(id)
    if (descendants.has(patch.output)) {
      return null
    }
    const route = new Set([id])
    let destination = patch.output
    while (destination !== "none" && destination !== "external") {
      if (route.has(destination)) {
        return null
      }
      route.add(destination)
      const next = source.find(track => track.id === destination)
      if (!next) {
        return null
      }
      destination = next.output
    }
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
