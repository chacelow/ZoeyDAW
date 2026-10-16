import { cloneTrack, createTrack } from "../model/reducers"
import { DEFAULT_TRACK_HEIGHT } from "../layout"
import { get, session, tracks, updateTrack } from "./context"

export const trackActions = {
  updateTrack,
  addTrack(kind: "audio" | "midi" | "group" | "return", parentId?: string) {
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
    const selected = new Set<string>()
    function includeChildren(id: string, branch = selected) {
      if (branch.has(id)) {
        return
      }
      branch.add(id)
      for (const child of source.find(track => track.id === id)?.childTrackIds ?? []) {
        includeChildren(child, branch)
      }
    }
    ids.forEach(id => includeChildren(id))
    const copies = source
      .filter(track => selected.has(track.id) && track.kind !== "main")
      .map(track => ({ sourceId: track.id, copy: cloneTrack(track) }))
    if (!copies.length) {
      return
    }
    const idMap = new Map(copies.map(item => [item.sourceId, item.copy.id]))
    const remappedCopies = copies.map(({ sourceId, copy }) => ({
      sourceId,
      copy: {
        ...copy,
        childTrackIds: copy.childTrackIds?.map(id => idMap.get(id) ?? id),
        sends: Object.fromEntries(
          Object.entries(copy.sends ?? {}).map(([id, level]) => [idMap.get(id) ?? id, level])
        ),
        output: idMap.get(copy.output) ?? copy.output,
      },
    }))
    const branchesAfter = new Map<string, typeof source>()
    for (const { sourceId, copy } of copies) {
      if (idMap.has(copy.output)) {
        continue
      }
      const branch = new Set<string>()
      includeChildren(sourceId, branch)
      const branchCopies = remappedCopies.filter(item => branch.has(item.sourceId))
      branchesAfter.set(
        branchCopies[branchCopies.length - 1].sourceId,
        branchCopies.map(item => item.copy)
      )
    }
    tracks(
      source.flatMap(track => {
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
        return [updated, ...(branchesAfter.get(track.id) ?? [])]
      })
    )
  },
  groupTracks(ids: string[]) {
    const source = get().document.tracks
    const chosen = source.filter(
      track =>
        ids.includes(track.id) &&
        !["main", "return", "group"].includes(track.kind) &&
        track.output === "main"
    )
    if (!chosen.length) {
      return
    }
    const group = {
      ...createTrack("group", source, undefined, DEFAULT_TRACK_HEIGHT),
      childTrackIds: chosen.map(track => track.id),
    }
    const next = source.filter(track => !chosen.includes(track))
    next.splice(
      source.indexOf(chosen[0]),
      0,
      group,
      ...chosen.map(track => ({ ...track, output: group.id }))
    )
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
