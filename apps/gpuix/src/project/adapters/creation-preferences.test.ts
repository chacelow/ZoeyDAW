import { afterEach, beforeEach, expect, it } from "bun:test"
import { PREFERENCE_DEFAULTS } from "../defaults/preferences"
import {
  configureProjectCreation,
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
} from "."
import {
  createMockDocument,
  createMockWorkspace,
  TEST_CREATION_NAMES,
  TEST_TRACK_APPEARANCE,
} from "./fixtures"

let preferences = structuredClone(PREFERENCE_DEFAULTS)
let names = { ...TEST_CREATION_NAMES }
let release: (() => void) | undefined
let removeCreation: (() => void) | undefined

beforeEach(() => {
  preferences = structuredClone(PREFERENCE_DEFAULTS)
  preferences.midi.keyboardOctave = 3
  preferences.midi.minimumOctave = 2
  preferences.midi.maximumOctave = 6
  preferences.midi.velocity = 71
  preferences.midi.recordedNoteLengthBeats = 0.5
  preferences.midi.recordedClipBars = 2
  names = { ...TEST_CREATION_NAMES }
  removeCreation = configureProjectCreation({
    names: () => names,
    appearance: () => TEST_TRACK_APPEARANCE,
    preferences: () => preferences,
  })
  const document = createMockDocument()
  const armed = document.tracks.find(track => track.id === "trager")
  if (!armed) throw new Error("Missing armed fixture")
  armed.clips = []
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
})

afterEach(() => {
  release?.()
  release = undefined
  removeCreation?.()
  removeCreation = undefined
})

it("keyboard range, initial velocity and recorded note/clip lengths follow current preferences", () => {
  expect(useProjectState.getState().session.midiOctave).toBe(preferences.midi.keyboardOctave)
  expect(useProjectState.getState().session.midiVelocity).toBe(preferences.midi.velocity)
  projectActions.setMidiOctave(-99)
  expect(useProjectState.getState().session.midiOctave).toBe(preferences.midi.minimumOctave)
  projectActions.setMidiOctave(99)
  expect(useProjectState.getState().session.midiOctave).toBe(preferences.midi.maximumOctave)
  release = startProjectRuntime()
  projectActions.togglePlay()
  projectActions.toggleRecording()
  projectActions.noteOn(72)
  projectActions.noteOff(72)
  const recorded = useProjectState.getState().document.tracks.find(track => track.id === "trager")
    ?.clips[0]
  expect(structuredClone(recorded)).toMatchObject({
    kind: "midi",
    label: names.clip("midi"),
    lengthBars: preferences.midi.recordedClipBars,
    notes: [
      {
        id: expect.any(String),
        pitch: 72,
        startBeat: expect.any(Number),
        lengthBeats: preferences.midi.recordedNoteLengthBeats,
        velocity: preferences.midi.velocity,
      },
    ],
  })
})

it.each(["finish", "cancel"])(
  "recorded clip names retain their event-time source when an edit is %s-ed",
  completion => {
    const eventLabel = "Event-time recorded MIDI"
    names = { ...names, clip: () => eventLabel }
    release = startProjectRuntime()
    projectActions.togglePlay()
    projectActions.toggleRecording()
    const token = projectActions.beginEdit("recorded-name-source")
    projectActions.setBpm(145)
    projectActions.noteOn(72)
    projectActions.noteOff(72)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips
    ).toHaveLength(0)

    names = { ...names, clip: kind => `Changed source ${kind}` }
    if (completion === "finish") projectActions.endEdit(token)
    else projectActions.cancelEdit(token)

    const recorded = useProjectState.getState().document.tracks.find(track => track.id === "trager")
      ?.clips[0]
    if (!recorded || recorded.kind !== "midi") throw new Error("Missing recorded MIDI clip")
    expect(recorded.label).toBe(eventLabel)
    expect(recorded.notes.map(note => note.pitch)).toEqual([72])

    projectActions.noteOn(74)
    projectActions.noteOff(74)
    const appended = useProjectState.getState().document.tracks.find(track => track.id === "trager")
      ?.clips[0]
    if (!appended || appended.kind !== "midi") throw new Error("Missing appended MIDI clip")
    expect(appended.id).toBe(recorded.id)
    expect(appended.label).toBe(eventLabel)
    expect(appended.notes.map(note => note.pitch)).toEqual([72, 74])
  }
)

it("new audio metadata and labels sample configuration once, leaving already-authored clips unchanged", () => {
  preferences.audio.reverse = true
  preferences.audio.warp = false
  preferences.audio.transpose = 9
  projectActions.createClip("3-audio", "audio", 20, 2)
  const created = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")
    ?.clips.at(-1)
  if (!created || created.kind !== "audio") throw new Error("Missing created audio fixture")
  expect(structuredClone(created.audioSettings)).toMatchObject(preferences.audio)
  const label = created.label
  names = { ...names, clip: kind => `changed-${kind}` }
  preferences.audio.reverse = false
  preferences.audio.transpose = -9
  const saved = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")
    ?.clips.at(-1)
  expect(saved?.label).toBe(label)
  expect(saved?.kind === "audio" && saved.audioSettings?.transpose).toBe(9)
  projectActions.createClip("3-audio", "audio", 22, 2)
  const next = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")
    ?.clips.at(-1)
  expect(next?.label).toBe(names.clip("audio"))
  expect(next?.kind === "audio" && next.audioSettings?.transpose).toBe(preferences.audio.transpose)
})
