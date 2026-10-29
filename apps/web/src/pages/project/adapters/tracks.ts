import { cloneTrack, createTrack, isOrdinaryTrack } from "@zoeydaw/project-core/reducers"
import { DEFAULT_TRACK_HEIGHT } from "../layout"
import { get, session, tracks, updateTrack } from "./context"

export const trackActions = {
  updateTrack,
  setTrackArmed(id: string, armed: boolean, additive = false) {
    const source = get().document.tracks
    tracks(
      source.map(track =>
        track.id === id
          ? { ...track, armed }
          : !additive && armed && (track.kind === "audio" || track.kind === "midi")
            ? { ...track, armed: false }
            : track
      )
    )
  },
  addTrack(kind: "audio" | "midi" | "group" | "return", parentId?: string): string {
    const source = get().document.tracks
    const parent = source.find(track => track.id === parentId && track.kind === "group")
    const created = createTrack(kind, source, parent?.id, DEFAULT_TRACK_HEIGHT)
    const index = parent
      ? source.indexOf(parent) + 1 + (parent.childTrackIds?.length ?? 0)
      : source.findIndex(track => track.id === "main")
    const result = source.map(track =>
      track.id === parent?.id
        ? { ...track, childTrackIds: [...(track.childTrackIds ?? []), created.id] }
        : track
    )
    result.splice(index < 0 ? result.length : index, 0, created)
    tracks(result)
    return created.id
  },
  deleteTracks(ids: string[]) {
    const doomed = new Set(ids)
    const source = get().document.tracks
    function descendants(id: string) {
      source
        .find(track => track.id === id)
        ?.childTrackIds?.forEach(child => {
          if (doomed.has(child)) {
            return
          }

          doomed.add(child)
          descendants(child)
        })
    }
    ids.forEach(descendants)
    doomed.delete("main")
    if (!source.some(track => !doomed.has(track.id) && isOrdinaryTrack(track))) {
      return
    }
    tracks(
      source
        .filter(track => !doomed.has(track.id))
        .map(track => ({
          ...track,
          childTrackIds: track.childTrackIds?.filter(id => !doomed.has(id)),
          sends: Object.fromEntries(
            Object.entries(track.sends ?? {}).filter(([id]) => !doomed.has(id))
          ),
          output: doomed.has(track.output) ? "main" : track.output,
        }))
    )
    session({ selectedTrackIds: [], selectedClipIds: [] })
  },
  duplicateTracks(ids: string[]) {
    const source = get().document.tracks
    const selected = new Set(ids)
    function includeChildren(id: string) {
      for (const child of source.find(track => track.id === id)?.childTrackIds ?? []) {
        if (selected.has(child)) {
          continue
        }

        selected.add(child)
        includeChildren(child)
      }
    }
    ids.forEach(includeChildren)
    const copies = source
      .filter(track => selected.has(track.id) && track.kind !== "main")
      .map(track => ({ sourceId: track.id, copy: cloneTrack(track) }))
    if (!copies.length) {
      return
    }
    const idMap = new Map(copies.map(item => [item.sourceId, item.copy.id]))
    tracks(
      source.flatMap(track => {
        const match = copies.find(item => item.sourceId === track.id)
        const updated =
          track.kind === "group" && !selected.has(track.id)
            ? {
                ...track,
                childTrackIds: track.childTrackIds?.flatMap(id => {
                  const copyId = idMap.get(id)
                  return copyId === undefined ? [id] : [id, copyId]
                }),
              }
            : track
        return match
          ? [
              updated,
              {
                ...match.copy,
                childTrackIds: match.copy.childTrackIds?.map(id => idMap.get(id) ?? id),
                sends: Object.fromEntries(
                  Object.entries(match.copy.sends ?? {}).map(([id, level]) => [
                    idMap.get(id) ?? id,
                    level,
                  ])
                ),
                output: idMap.get(match.copy.output) ?? match.copy.output,
              },
            ]
          : [updated]
      })
    )
  },
  groupTracks(ids: string[]) {
    const source = get().document.tracks
    // Any track except Main/Return can be grouped, including a Group: nesting is
    // expressed by the new group's `output`, so every member must already share
    // one parent for the result to stay a single subtree.
    const candidates = source.filter(
      track => ids.includes(track.id) && !["main", "return"].includes(track.kind)
    )
    if (!candidates.length) {
      return
    }
    const parent = candidates[0].output
    const chosen = candidates.filter(track => track.output === parent)
    if (!chosen.length) {
      return
    }
    const group = {
      ...createTrack("group", source, parent === "main" ? undefined : parent, DEFAULT_TRACK_HEIGHT),
      childTrackIds: chosen.map(track => track.id),
    }
    const members = chosen.map(track => ({ ...track, output: group.id }))
    // The new group takes the first member's slot and the members follow it, so
    // nesting never depends on where Main happens to sit.
    const next: typeof source = []
    let inserted = false
    for (const track of source) {
      if (track.id === chosen[0].id) {
        next.push(group, ...members)
        inserted = true
        continue
      }
      if (chosen.includes(track)) {
        continue
      }
      if (parent !== "main" && track.id === parent) {
        const children = track.childTrackIds ?? []
        const first = children.indexOf(chosen[0].id)
        const memberIds = chosen.map(item => item.id)
        // Replace the contiguous member run with the group, so the parent lists
        // each child exactly once even when members were not adjacent.
        const nextChildren =
          first === -1
            ? [...children, group.id]
            : [
                ...children.slice(0, first).filter(child => !memberIds.includes(child)),
                group.id,
                ...children.slice(first).filter(child => !memberIds.includes(child)),
              ]
        next.push({ ...track, childTrackIds: nextChildren })
        continue
      }
      next.push(track)
    }
    if (!inserted) {
      next.push(group, ...members)
    }
    tracks(next)
  },
  ungroupTrack(id: string) {
    const source = get().document.tracks
    const group = source.find(track => track.id === id && track.kind === "group")
    if (!group) {
      return
    }
    const parentId = group.output
    const promoted = group.childTrackIds ?? []
    tracks(
      source
        .filter(track => track.id !== id)
        .map(track => ({
          ...track,
          output: track.output === id ? parentId : track.output,
          childTrackIds: track.childTrackIds?.flatMap(child =>
            child === id ? (track.id === parentId ? promoted : []) : [child]
          ),
        }))
    )
  },
  reorderTrack(id: string, targetId: string) {
    const source = get().document.tracks
    const moving = source.find(track => track.id === id)
    const target = source.find(track => track.id === targetId)
    if (
      !moving ||
      !target ||
      moving.kind === "main" ||
      target.kind === "main" ||
      moving.id === target.id
    ) {
      return
    }
    const branch = new Set([id])
    function collect(parentId: string) {
      for (const child of source.find(track => track.id === parentId)?.childTrackIds ?? []) {
        branch.add(child)
        collect(child)
      }
    }
    collect(id)
    if (branch.has(targetId)) {
      return
    }
    const movingTracks = source.filter(track => branch.has(track.id))
    const next = source.filter(track => !branch.has(track.id))
    next.splice(
      next.findIndex(track => track.id === targetId),
      0,
      ...movingTracks
    )
    const parentId =
      target.output !== "main" && target.output !== "none" && target.output !== "external"
        ? target.output
        : null
    tracks(
      next.map(track => {
        if (track.id === id) {
          return { ...track, output: parentId ?? "main" }
        }
        if (!track.childTrackIds || branch.has(track.id)) {
          return track
        }
        const children = track.childTrackIds.filter(child => child !== id)
        if (track.id === parentId) {
          children.push(id)
        }
        return {
          ...track,
          childTrackIds: children.sort(
            (a, b) => next.findIndex(item => item.id === a) - next.findIndex(item => item.id === b)
          ),
        }
      })
    )
  },
}
