import { positionToBar } from "../model/types"
import type { MidiClip, MidiNote } from "../model/types"
import { createClip, uniqueId } from "../model/reducers"
import { get, session, tracks } from "./context"

/** Keyboard events are visual/mock input only. MIDI notes go into armed tracks while recording. */
export const midiActions = {
  noteOn(pitch: number) {
    if (
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      get().session.activeMidiNotes.includes(pitch)
    )
      return
    const state = get()
    session({ activeMidiNotes: [...state.session.activeMidiNotes, pitch] })
    if (!state.session.recording || !state.session.playing) return
    const bar = positionToBar(state.session.position, state.document.transport.numerator)
    const beatInBar = (bar - Math.floor(bar)) * state.document.transport.numerator
    const note: MidiNote = {
      id: uniqueId("note"),
      pitch,
      startBeat: beatInBar,
      lengthBeats: 0.25,
      velocity: state.session.midiVelocity,
    }
    let recorded = false
    const next = state.document.tracks.map(track => {
      if (!track.armed || track.kind !== "midi") return track
      recorded = true
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
    })
    if (recorded) tracks(next)
  },
  noteOff(pitch: number) {
    if (!get().session.activeMidiNotes.includes(pitch)) return
    const remaining = get().session.activeMidiNotes.filter(note => note !== pitch)
    session({
      activeMidiNotes: remaining,
      ...(!remaining.length && !get().session.playing ? { levels: {} } : {}),
    })
  },
  setMidiOctave(octave: number) {
    if (Number.isInteger(octave)) session({ midiOctave: Math.max(0, Math.min(8, octave)) })
  },
  setMidiVelocity(velocity: number) {
    if (Number.isFinite(velocity))
      session({ midiVelocity: Math.max(1, Math.min(127, Math.round(velocity))) })
  },
}
