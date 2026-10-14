import type { Track } from "./types"

export function canRouteTrack(
  sourceId: string,
  destinationId: string,
  tracks: readonly Track[]
): boolean {
  const source = tracks.find(track => track.id === sourceId)
  if (!source || sourceId === destinationId) return false
  if (destinationId === "none" || destinationId === "external") return true
  const destination = tracks.find(track => track.id === destinationId)
  if (!destination || (destination.kind !== "group" && destination.kind !== "main")) return false

  const descendants = new Set<string>()
  const pending = [...(source.childTrackIds ?? [])]
  while (pending.length) {
    const child = pending.pop()
    if (child === undefined || descendants.has(child)) continue
    descendants.add(child)
    pending.push(...(tracks.find(track => track.id === child)?.childTrackIds ?? []))
  }
  if (descendants.has(destinationId)) return false

  const route = new Set([sourceId])
  let nextId = destinationId
  while (nextId !== "none" && nextId !== "external") {
    if (route.has(nextId)) return false
    route.add(nextId)
    const next = tracks.find(track => track.id === nextId)
    if (!next) return false
    nextId = next.output
  }
  return true
}

export function routingDestinations(track: Track, tracks: readonly Track[]): Track[] {
  return tracks.filter(
    destination =>
      (destination.kind === "group" || destination.kind === "main") &&
      canRouteTrack(track.id, destination.id, tracks)
  )
}
