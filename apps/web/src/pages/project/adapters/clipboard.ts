import { acceptsClip } from "@zoeydaw/project-core/types"
import { collectClips, parseClipClipboard } from "@zoeydaw/project-core/clip-clipboard"
import { clipWindow } from "@zoeydaw/project-core/clip-window"
import { insertClips } from "@zoeydaw/project-core/clip-edits"
import { cloneClip, uniqueId } from "@zoeydaw/project-core/reducers"
import { clipboardMemory } from "./clipboard-memory"
import { document as replaceDocument, get, session, tracks } from "./context"
import type { ClipClipboard } from "@zoeydaw/project-core/clip-clipboard"
import type { Clip, MidiPattern, TimeSelection } from "@zoeydaw/project-core/types"

function copyClips(ids: string[], range?: TimeSelection): ClipClipboard | null {
  const current = get().document
  const copied = collectClips(current.tracks, ids, range, current.transport.bpm, current.patterns)
  if (copied) {
    clipboardMemory.write(JSON.stringify(copied))
  }
  return copied
}

function outsideRange(
  clip: Clip,
  range: Pick<TimeSelection, "startBar" | "endBar">,
  bpm: number
): Clip[] {
  if (clip.startBar >= range.endBar || clip.startBar + clip.lengthBars <= range.startBar)
    return [clip]
  const left = clipWindow(clip, clip.startBar, range.startBar, bpm)
  const right = clipWindow(clip, range.endBar, clip.startBar + clip.lengthBars, bpm)
  return [left, right].flatMap(piece =>
    piece ? [{ ...piece, id: !left || piece === left ? clip.id : uniqueId("clip") }] : []
  )
}

function removeClips(ids: readonly string[], range?: TimeSelection): boolean {
  if (range && range.endBar <= range.startBar) return false
  const current = get().document
  const chosen = new Set(ids)
  let changed = false
  const next = current.tracks.map(track => {
    if (range && !range.trackIds.includes(track.id)) return track
    const clips = track.clips.flatMap(clip => {
      if (!range) {
        if (!chosen.has(clip.id)) return [clip]
        changed = true
        return []
      }
      const pieces = outsideRange(clip, range, current.transport.bpm)
      if (pieces.length !== 1 || pieces[0] !== clip) changed = true
      return pieces
    })
    return clips.every((clip, index) => clip === track.clips[index]) &&
      clips.length === track.clips.length
      ? track
      : { ...track, clips }
  })
  if (!changed) return false
  tracks(next)
  session({ selectedClipIds: [] })
  return true
}

function samePatternContent(left: MidiPattern, right: MidiPattern): boolean {
  return (
    left.loopBars === right.loopBars &&
    left.notes.length === right.notes.length &&
    left.notes.every((note, index) => {
      const other = right.notes[index]
      return (
        note.id === other.id &&
        note.pitch === other.pitch &&
        note.startBeat === other.startBeat &&
        note.lengthBeats === other.lengthBeats &&
        note.velocity === other.velocity
      )
    })
  )
}

export const clipboardActions = {
  copyClips,
  deleteTimeSelection(range: TimeSelection) {
    return removeClips([], range)
  },
  cutClips(ids: string[], range?: TimeSelection) {
    const copied = copyClips(ids, range)
    if (!copied) {
      return null
    }
    removeClips(ids, range)
    return copied
  },
  pasteClips(
    targetTrackId: string,
    startBar: number,
    source: ClipClipboard | null = clipboardActions.getClipClipboard()
  ) {
    if (!source || !Number.isFinite(startBar) || startBar < 1) {
      return false
    }
    const currentDocument = get().document
    const current = currentDocument.tracks
    const lanes = current.filter(track => track.kind === "audio" || track.kind === "midi")
    const first = lanes.findIndex(track => track.id === targetTrackId)
    if (
      first === -1 ||
      !source.items.length ||
      (source.range &&
        (first + source.range.trackCount > lanes.length ||
          !Number.isFinite(startBar + source.range.lengthBars)))
    ) {
      return false
    }
    const placements: {
      item: (typeof source.items)[number]
      destination: (typeof lanes)[number]
    }[] = []
    const mediaIds = new Set(currentDocument.media.map(source => source.id))
    const sourcePatterns = new Map(source.patterns.map(pattern => [pattern.id, pattern]))
    for (const item of source.items) {
      const destination = lanes[first + item.trackOffset]
      if (
        !destination ||
        !acceptsClip(destination.kind, item.clip.kind) ||
        (item.clip.kind === "audio" &&
          item.clip.sourceId !== null &&
          !mediaIds.has(item.clip.sourceId)) ||
        (item.clip.kind === "pattern" && !sourcePatterns.has(item.clip.patternId)) ||
        !Number.isFinite(startBar + item.barOffset + item.clip.lengthBars)
      ) {
        return false
      }
      placements.push({ item, destination })
    }
    const patterns = [...currentDocument.patterns]
    const existingPatterns = new Map(patterns.map(pattern => [pattern.id, pattern]))
    const reservedPatternIds = new Set([...existingPatterns.keys(), ...sourcePatterns.keys()])
    const remappedPatternIds = new Map<string, string>()
    const referencedPatternIds = new Set(
      source.items.flatMap(item => (item.clip.kind === "pattern" ? [item.clip.patternId] : []))
    )
    for (const patternId of referencedPatternIds) {
      const pattern = sourcePatterns.get(patternId)
      if (!pattern) return false
      const existing = existingPatterns.get(patternId)
      if (existing && samePatternContent(existing, pattern)) continue
      let importedId = patternId
      if (existing) {
        do {
          importedId = uniqueId("pattern")
        } while (reservedPatternIds.has(importedId))
        remappedPatternIds.set(patternId, importedId)
      }
      reservedPatternIds.add(importedId)
      patterns.push({ ...structuredClone(pattern), id: importedId })
    }
    const additions = new Map<string, Clip[]>()
    const copied: string[] = []
    for (const { item, destination } of placements) {
      const clip = { ...cloneClip(item.clip), startBar: startBar + item.barOffset }
      if (clip.kind === "pattern") {
        clip.patternId = remappedPatternIds.get(clip.patternId) ?? clip.patternId
      }
      additions.set(destination.id, [...(additions.get(destination.id) ?? []), clip])
      copied.push(clip.id)
    }
    if (!copied.length) {
      return false
    }
    const pastedRange = source.range
      ? {
          startBar,
          endBar: startBar + source.range.lengthBars,
          trackIds: lanes.slice(first, first + source.range.trackCount).map(track => track.id),
        }
      : null
    replaceDocument({
      ...currentDocument,
      patterns,
      tracks: current.map(track => {
        const added = additions.get(track.id) ?? []
        const clips = pastedRange?.trackIds.includes(track.id)
          ? track.clips.flatMap(clip =>
              outsideRange(clip, pastedRange, currentDocument.transport.bpm)
            )
          : track.clips
        return added.length || clips !== track.clips
          ? {
              ...track,
              clips: insertClips(
                clips,
                added,
                () => uniqueId("clip"),
                currentDocument.transport.bpm
              ),
            }
          : track
      }),
    })
    session({
      selectedClipIds: copied,
      ...(pastedRange && {
        timeSelection: pastedRange,
        insertionPoint: { trackId: targetTrackId, bar: startBar },
      }),
    })
    return true
  },
  getClipClipboard: () => parseClipClipboard(clipboardMemory.read()),
}
