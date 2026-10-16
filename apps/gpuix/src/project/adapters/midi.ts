import { createClip, uniqueId } from "../model/reducers"
import {
  get,
  recordDocument,
  session,
  readRecordingBar,
  projectPreferences,
  projectCreationValues,
} from "./context"
import type { MidiClip, MidiNote } from "../model/types"

/**
Keyboard events are visual/mock input only. MIDI notes go into armed tracks while recording.
*/
export const midiActions = {
  noteOn(pitch: number) {
    if (
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      get().session.activeMidiNotes.includes(pitch)
    ) {
      return
    }
    const state = get()
    const policy = projectPreferences().midi
    session({ activeMidiNotes: [...state.session.activeMidiNotes, pitch] })
    const bar = readRecordingBar()
    if (bar === null) {
      return
    }
    const beatInBar = (bar - Math.floor(bar)) * state.document.transport.numerator
    const note: MidiNote = {
      id: uniqueId("note"),
      pitch,
      startBeat: beatInBar,
      lengthBeats: policy.recordedNoteLengthBeats,
      velocity: state.session.midiVelocity,
    }
    const armedTrackIds = state.document.tracks
      .filter(track => track.armed && track.kind === "midi")
      .map(track => track.id)
    if (!armedTrackIds.length) {
      return
    }
    const clipLabel = projectCreationValues().names.clip("midi")
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
        const fresh = createClip("midi", Math.floor(bar), policy.recordedClipBars)
        if (fresh.kind !== "midi") return track
        const clip: MidiClip = {
          ...fresh,
          label: clipLabel,
          notes: [note],
        }
        return { ...track, clips: [...track.clips, clip] }
      }),
    }))
  },
  noteOff(pitch: number) {
    if (!get().session.activeMidiNotes.includes(pitch)) {
      return
    }
    const remaining = get().session.activeMidiNotes.filter(note => note !== pitch)
    session({
      activeMidiNotes: remaining,
      ...(!remaining.length && !get().session.playing && { levels: {} }),
    })
  },
  setMidiOctave(octave: number) {
    if (Number.isInteger(octave)) {
      const policy = projectPreferences().midi
      session({
        midiOctave: Math.max(policy.minimumOctave, Math.min(policy.maximumOctave, octave)),
      })
    }
  },
  setMidiVelocity(velocity: number) {
    if (Number.isFinite(velocity)) {
      session({ midiVelocity: Math.max(1, Math.min(127, Math.round(velocity))) })
    }
  },
}
