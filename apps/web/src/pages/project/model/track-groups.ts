import type { Track } from "./types"

export interface GroupRail {
  group: Track
  closes: boolean
}

export interface TrackGroupProjection {
  railsByTrackId: ReadonlyMap<string, readonly GroupRail[]>
  leafDescendantsByGroupId: ReadonlyMap<string, readonly Track[]>
}

/** One ancestry/leaf projection for both header rails and group-lane summaries. */
export function projectTrackGroups(tracks: readonly Track[]): TrackGroupProjection {
  const parentById = new Map<string, { group: Track; lastChild: boolean }>()
  const leaves = new Map<string, Track[]>()
  for (const track of tracks) {
    if (track.kind !== "group") continue
    leaves.set(track.id, [])
    track.childTrackIds?.forEach((id, index, children) => {
      parentById.set(id, { group: track, lastChild: index === children.length - 1 })
    })
  }

  type Branch = { group: Track; lastChild: boolean }
  const branchById = new Map<string, readonly Branch[]>()
  function branchFor(track: Track): readonly Branch[] {
    const cached = branchById.get(track.id)
    if (cached) return cached
    const parent = parentById.get(track.id)
    const branch = parent ? [...branchFor(parent.group), parent] : []
    branchById.set(track.id, branch)
    return branch
  }

  const railsByTrackId = new Map<string, readonly GroupRail[]>()
  for (const track of tracks) {
    const branch = branchFor(track)
    const terminal = track.kind !== "group" || track.collapsed || !track.childTrackIds?.length
    railsByTrackId.set(
      track.id,
      branch.map((ancestor, index) => ({
        group: ancestor.group,
        closes: Boolean(terminal && branch.slice(index).every(item => item.lastChild)),
      }))
    )
    if (track.kind !== "group")
      for (const ancestor of branch) leaves.get(ancestor.group.id)?.push(track)
  }
  return { railsByTrackId, leafDescendantsByGroupId: leaves }
}
