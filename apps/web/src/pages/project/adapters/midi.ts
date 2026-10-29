import { createClip, uniqueId } from "@zoeydaw/project-core/reducers"
import { get, recordDocument, session, readRecordingBar, submitNote } from "./context"
import type { MidiClip, MidiNote } from "@zoeydaw/project-core/types"
import type { BackendNote, BackendNoteSource } from "@zoeydaw/project-core/backend"

const heldEdges = new Map<number, { epoch: string; notes: BackendNote[] }>()
export const midiActions = {
  noteOn(pitch: number, source: BackendNoteSource = "pianoKeyboard") {
    if (
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      get().session.activeMidiNotes.includes(pitch)
    ) {
      return
    }
    const state = get()
    const notes = state.document.tracks
      .filter(track => track.kind === "midi" && track.armed && track.monitor !== "off")
      .map(track => ({
        trackId: track.id,
        noteId: uniqueId("live-note"),
        pitch,
        velocity: state.session.midiVelocity,
        on: true,
        source,
      }))
    if (!notes.length) return
    heldEdges.set(pitch, { epoch: state.session.editEpoch, notes })
    session({ activeMidiNotes: [...state.session.activeMidiNotes, pitch] })
    for (const note of notes) submitNote(note)
    const bar = readRecordingBar()
    if (bar === null) {
      return
    }
    const beatInBar = (bar - Math.floor(bar)) * state.document.transport.numerator
    const note: MidiNote = {
      id: uniqueId("note"),
      pitch,
      startBeat: beatInBar,
      lengthBeats: 0.25,
      velocity: state.session.midiVelocity,
    }
    const armedTrackIds = state.document.tracks
      .filter(track => track.armed && track.kind === "midi")
      .map(track => track.id)
    if (!armedTrackIds.length) {
      return
    }
    recordDocument(document => ({
      ...document,
      tracks: document.tracks.map(track => {
        if (!armedTrackIds.includes(track.id) || track.kind !== "midi") return track
        const current = track.clips.find(
          clip =>
            clip.kind === "midi" && bar >= clip.startBar && bar < clip.startBar + clip.lengthBars
        )
        if (current)
          return {
            ...track,
            clips: track.clips.map(clip =>
              clip.id === current.id && clip.kind === "midi"
                ? {
                    ...clip,
                    notes: [
                      ...clip.notes,
                      {
                        ...note,
                        startBeat:
                          (bar - clip.startBar + (clip.sourceOffsetBars ?? 0)) *
                          state.document.transport.numerator,
                      },
                    ],
                  }
                : clip
            ),
          }
        const fresh = createClip("midi", Math.floor(bar), 1)
        if (fresh.kind !== "midi") return track
        const clip: MidiClip = { ...fresh, notes: [note] }
        return { ...track, clips: [...track.clips, clip] }
      }),
    }))
  },
  noteOff(pitch: number) {
    const held = heldEdges.get(pitch)
    heldEdges.delete(pitch)
    if (held?.epoch === get().session.editEpoch) {
      for (const note of held.notes) submitNote({ ...note, on: false, velocity: 0 })
    }
    if (!get().session.activeMidiNotes.includes(pitch)) {
      return
    }
    const remaining = get().session.activeMidiNotes.filter(note => note !== pitch)
    session({
      activeMidiNotes: remaining,
    })
  },
  setMidiOctave(octave: number) {
    if (Number.isInteger(octave)) {
      session({ midiOctave: Math.max(0, Math.min(8, octave)) })
    }
  },
  setMidiVelocity(velocity: number) {
    if (Number.isFinite(velocity)) {
      session({ midiVelocity: Math.max(1, Math.min(127, Math.round(velocity))) })
    }
  },
}
