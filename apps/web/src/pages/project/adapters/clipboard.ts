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
  cutClips(ids: string[], range?: TimeSelection) {
    const copied = copyClips(ids, range)
    if (!copied) {
      return null
    }
    const chosen = new Set(ids)
    tracks(
      get().document.tracks.map(track => ({
        ...track,
        clips: track.clips.flatMap(clip => {
          if (!chosen.has(clip.id) || (range && !range.trackIds.includes(track.id))) return [clip]
          if (!range) return []
          const bpm = get().document.transport.bpm
          const intersection = clipWindow(clip, range.startBar, range.endBar, bpm)
          if (!intersection) return [clip]
          const left = clipWindow(clip, clip.startBar, intersection.startBar, bpm)
          const right = clipWindow(
            clip,
            intersection.startBar + intersection.lengthBars,
            clip.startBar + clip.lengthBars,
            bpm
          )
          return [left, right].flatMap(piece =>
            piece ? [{ ...piece, id: !left || piece === left ? clip.id : cloneClip(piece).id }] : []
          )
        }),
      }))
    )
    session({ selectedClipIds: [] })
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
    if (first === -1 || !source.items.length) {
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
    replaceDocument({
      ...currentDocument,
      patterns,
      tracks: current.map(track => {
        const added = additions.get(track.id)
        return added
          ? {
              ...track,
              clips: insertClips(
                track.clips,
                added,
                () => uniqueId("clip"),
                currentDocument.transport.bpm
              ),
            }
          : track
      }),
    })
    session({ selectedClipIds: copied })
    return true
  },
  getClipClipboard: () => parseClipClipboard(clipboardMemory.read()),
}
