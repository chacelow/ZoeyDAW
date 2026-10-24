import type { MidiNote } from "@zoeydaw/project-core/types"

const TYPE = "application/x-zoeymind-midi-notes+json"

export function serializeNotes(notes: readonly MidiNote[]): string {
  return JSON.stringify({ type: TYPE, version: 1, notes })
}

export function parseNotes(text: string): MidiNote[] | null {
  if (text.length > 250_000) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    value.type !== TYPE ||
    !("version" in value) ||
    value.version !== 1 ||
    !("notes" in value) ||
    !Array.isArray(value.notes) ||
    value.notes.length === 0 ||
    value.notes.length > 2048
  ) {
    return null
  }
  const notes: MidiNote[] = []
  for (const note of value.notes) {
    if (
      !note ||
      typeof note !== "object" ||
      !("pitch" in note) ||
      !("startBeat" in note) ||
      !("lengthBeats" in note) ||
      !("velocity" in note) ||
      typeof note.pitch !== "number" ||
      !Number.isInteger(note.pitch) ||
      note.pitch < 0 ||
      note.pitch > 127 ||
      typeof note.startBeat !== "number" ||
      !Number.isFinite(note.startBeat) ||
      note.startBeat < 0 ||
      typeof note.lengthBeats !== "number" ||
      !Number.isFinite(note.lengthBeats) ||
      note.lengthBeats <= 0 ||
      typeof note.velocity !== "number" ||
      !Number.isInteger(note.velocity) ||
      note.velocity < 1 ||
      note.velocity > 127 ||
      ("id" in note && typeof note.id !== "string")
    ) {
      return null
    }
    notes.push({
      pitch: note.pitch,
      startBeat: note.startBeat,
      lengthBeats: note.lengthBeats,
      velocity: note.velocity,
    })
  }
  return notes
}
