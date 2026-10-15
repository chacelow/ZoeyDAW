import type { Track } from "./types"

interface RoutingIndex {
  readonly source: Track
  readonly tracksById: ReadonlyMap<string, Track>
  readonly descendants: ReadonlySet<string>
}

function indexRouting(sourceId: string, tracks: readonly Track[]): RoutingIndex | null {
  const tracksById = new Map<string, Track>()
  for (const track of tracks) tracksById.set(track.id, track)
  const source = tracksById.get(sourceId)
  if (!source) return null
  const descendants = new Set<string>()
  const pending = [...(source.childTrackIds ?? [])]
  while (pending.length) {
    const child = pending.pop()
    if (child === undefined || descendants.has(child)) continue
    descendants.add(child)
    pending.push(...(tracksById.get(child)?.childTrackIds ?? []))
  }
  return { source, tracksById, descendants }
}

function allowsRouting(index: RoutingIndex, destinationId: string): boolean {
  if (index.source.id === destinationId) return false
  if (destinationId === "none" || destinationId === "external") return true
  const destination = index.tracksById.get(destinationId)
  if (!destination || (destination.kind !== "group" && destination.kind !== "main")) return false
  if (index.descendants.has(destinationId)) return false
  const route = new Set([index.source.id])
  let nextId = destinationId
  while (nextId !== "none" && nextId !== "external") {
    if (route.has(nextId)) return false
    route.add(nextId)
    const next = index.tracksById.get(nextId)
    if (!next) return false
    nextId = next.output
  }
  return true
}

export function canRouteTrack(
  sourceId: string,
  destinationId: string,
  tracks: readonly Track[]
): boolean {
  const index = indexRouting(sourceId, tracks)
  return index !== null && allowsRouting(index, destinationId)
}

export function routingDestinations(track: Track, tracks: readonly Track[]): Track[] {
  const index = indexRouting(track.id, tracks)
  return index
    ? tracks.filter(
        destination =>
          (destination.kind === "group" || destination.kind === "main") &&
          allowsRouting(index, destination.id)
      )
    : []
}
