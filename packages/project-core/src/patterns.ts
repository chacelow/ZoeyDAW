import type { DocumentState, MidiClip, MidiNote, MidiPattern, PatternClip } from "./types"

export function resolveMidiClip(
  clip: MidiClip | PatternClip,
  patterns: readonly MidiPattern[]
): MidiClip {
  if (clip.kind === "midi") return clip
  const pattern = patterns.find(item => item.id === clip.patternId)
  if (!pattern) throw new Error(`Missing Pattern content: ${clip.patternId}`)
  const { patternId: _patternId, ...placement } = clip
  return { ...placement, kind: "midi", notes: pattern.notes, loopBars: pattern.loopBars }
}

export function ensurePatternReferences(document: DocumentState): DocumentState {
  const known = new Set(document.patterns.map(pattern => pattern.id))
  const additions: MidiPattern[] = []
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "pattern" || known.has(clip.patternId)) continue
      known.add(clip.patternId)
      additions.push({ id: clip.patternId, notes: [], loopBars: clip.lengthBars })
    }
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
