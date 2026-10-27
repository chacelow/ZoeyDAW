import type {
  ClipContent,
  DocumentState,
  MidiClip,
  MidiClipContent,
  MidiNote,
  MidiPattern,
  PatternClip,
  PatternClipContent,
} from "./types"

export function resolveMidiClip(
  clip: MidiClip | PatternClip,
  patterns: readonly MidiPattern[]
): MidiClip
export function resolveMidiClip(
  clip: MidiClipContent | PatternClipContent,
  patterns: readonly MidiPattern[]
): MidiClipContent
export function resolveMidiClip(
  clip: MidiClipContent | PatternClipContent,
  patterns: readonly MidiPattern[]
): MidiClipContent {
  if (clip.kind === "midi") return clip
  const pattern = patterns.find(item => item.id === clip.patternId)
  if (!pattern) throw new Error(`Missing Pattern content: ${clip.patternId}`)
  const { patternId: _patternId, ...placement } = clip
  return { ...placement, kind: "midi", notes: pattern.notes, loopBars: pattern.loopBars }
}

export function ensurePatternReferences(document: DocumentState): DocumentState {
  const known = new Set(document.patterns.map(pattern => pattern.id))
  const additions: MidiPattern[] = []
  const collect = (clip: ClipContent) => {
    if (clip.kind !== "pattern" || known.has(clip.patternId)) return
    known.add(clip.patternId)
    additions.push({ id: clip.patternId, notes: [], loopBars: clip.lengthBars })
  }
  for (const track of document.tracks) {
    for (const clip of track.clips) collect(clip)
    for (const slot of track.clipSlots ?? []) collect(slot.clip)
  }
  return additions.length
    ? { ...document, patterns: [...document.patterns, ...additions] }
    : document
}

export function withPatternNotes(
  document: DocumentState,
  patternId: string,
  notes: MidiNote[],
  loopBars?: number
): DocumentState {
  if (!document.patterns.some(pattern => pattern.id === patternId)) return document
  return {
    ...document,
    patterns: document.patterns.map(pattern =>
      pattern.id === patternId
        ? { ...pattern, notes: structuredClone(notes), loopBars: loopBars ?? pattern.loopBars }
        : pattern
    ),
  }
}

function isMidiNote(value: unknown): value is MidiNote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return (
    (!("id" in value) || value.id === undefined || typeof value.id === "string") &&
    "pitch" in value &&
    typeof value.pitch === "number" &&
    Number.isInteger(value.pitch) &&
    value.pitch >= 0 &&
    value.pitch <= 127 &&
    "startBeat" in value &&
    typeof value.startBeat === "number" &&
    Number.isFinite(value.startBeat) &&
    value.startBeat >= 0 &&
    "lengthBeats" in value &&
    typeof value.lengthBeats === "number" &&
    Number.isFinite(value.lengthBeats) &&
    value.lengthBeats > 0 &&
    "velocity" in value &&
    typeof value.velocity === "number" &&
    Number.isInteger(value.velocity) &&
    value.velocity >= 0 &&
    value.velocity <= 127
  )
}

export function isMidiNotes(value: unknown): value is MidiNote[] {
  if (!Array.isArray(value) || !value.every(isMidiNote)) return false
  const ids = new Set<string>()
  for (const note of value) {
    if (note.id !== undefined) {
      if (ids.has(note.id)) return false
      ids.add(note.id)
    }
  }
  return true
}
