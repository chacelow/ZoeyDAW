import { expect, it } from "bun:test"
import { createStore } from "zustand/vanilla"
import { PREFERENCE_DEFAULTS } from "./preferences"
import {
  PROJECT_TEMPLATE,
  createProjectTemplate,
  createSessionTemplate,
  createUnopenedDocument,
  createWorkspaceTemplate,
} from "./template"
import { cloneTrack, createClip, createTrack } from "../model/reducers"
import { defaultAudioClipSettings } from "../model/audio-editor"
import {
  drawCells,
  eraseCells,
  insertNote,
  pasteNotes,
  transformNotes,
} from "../model/midi-editing"
import { growTimelineBars, timelineBars } from "../model/selectors"
import { projectBackendDocument } from "../adapters/backend/projection"
import { createProjectRuntime } from "../adapters/runtime"
import { TEST_CREATION, TEST_CREATION_NAMES, TEST_TRACK_APPEARANCE } from "../adapters/fixtures"
import type { ProjectState } from "../model/types"

it("projects an injected transport, musical and Main template without sharing authored objects", () => {
  const source = structuredClone(PROJECT_TEMPLATE)
  source.transport.bpm += 23
  source.transport.numerator = 3
  source.transport.loop.startBar = 7
  source.transport.loop.lengthBars = 5
  source.transport.loop.enabled = true
  source.musical.scaleRoot = "D"
  source.musical.groove = 19
  source.track.mixer.volumeDb = -13
  source.track.io.main.outputChannel = "3-4"
  const names = { ...TEST_CREATION_NAMES, project: "Injected project", main: "Injected output" }
  const appearance = { ...TEST_TRACK_APPEARANCE, mainHeightPx: 149 }
  const first = createProjectTemplate({
    names,
    appearance,
    preferences: PREFERENCE_DEFAULTS,
    source,
  })
  expect(first.document.name).toBe(names.project)
  expect(first.document.transport).toMatchObject({
    bpm: source.transport.bpm,
    numerator: source.transport.numerator,
    loop: {
      enabled: source.transport.loop.enabled,
      startBar: source.transport.loop.startBar,
      endBar: source.transport.loop.startBar + source.transport.loop.lengthBars,
    },
  })
  expect(first.document).toMatchObject(source.musical)
  expect(first.document.tracks[0]).toMatchObject({
    name: names.main,
    color: appearance.colors.main,
    heightPx: appearance.mainHeightPx,
    volumeDb: source.track.mixer.volumeDb,
    outputChannel: source.track.io.main.outputChannel,
  })
  first.document.transport.loop.endBar++
  const sends = first.document.tracks[0].sends
  if (!sends) throw new Error("New Main track must have sends")
  sends.test = -9
  const second = createProjectTemplate({
    names,
    appearance,
    preferences: PREFERENCE_DEFAULTS,
    source,
  })
  expect(second.document.transport.loop.endBar).toBe(
    source.transport.loop.startBar + source.transport.loop.lengthBars
  )
  expect(second.document.tracks[0].sends).toEqual({})
})

it("new tracks follow injected routing, mixer, names and appearance while copies retain authored appearance", () => {
  const source = structuredClone(PROJECT_TEMPLATE)
  source.track.mixer.pan = 0.23
  source.track.mixer.volumeDb = -7
  source.track.io.audio.inputChannel = "2"
  source.track.io.audio.outputChannel = "3-4"
  const appearance = {
    ...TEST_TRACK_APPEARANCE,
    heightPx: 93,
    colors: { ...TEST_TRACK_APPEARANCE.colors, audio: "changed-audio" },
  }
  const names = {
    ...TEST_CREATION_NAMES,
    track: (kind: "audio" | "midi" | "group" | "return", count: number) =>
      `injected-${kind}-${count}`,
    copy: (name: string) => `duplicate-${name}`,
  }
  const track = createTrack("audio", [], undefined, { names, appearance, source })
  expect(track).toMatchObject({
    name: names.track("audio", 1),
    heightPx: appearance.heightPx,
    color: appearance.colors.audio,
    pan: source.track.mixer.pan,
    volumeDb: source.track.mixer.volumeDb,
    inputChannel: source.track.io.audio.inputChannel,
    outputChannel: source.track.io.audio.outputChannel,
  })
  const copy = cloneTrack(track, names)
  expect(copy.name).toBe(names.copy(track.name))
  expect(copy.color).toBe(track.color)
  expect(copy.heightPx).toBe(track.heightPx)
  expect(copy.id).not.toBe(track.id)
})

it("audio creation and engine projection consume clip gain and fade template values", () => {
  const source = structuredClone(PROJECT_TEMPLATE)
  source.clip.gainDb = -11
  source.clip.fade = { curve: -0.43, position: 0.31, durationBars: 0.7, offsetBars: 0.2 }
  const clip = createClip("audio", 1, 8, source)
  if (clip.kind !== "audio") throw new Error("Expected audio fixture")
  const { document } = createProjectTemplate({ ...TEST_CREATION, preferences: PREFERENCE_DEFAULTS })
  const track = createTrack("audio", document.tracks, undefined, TEST_CREATION)
  track.clips = [clip]
  document.tracks.unshift(track)
  expect(projectBackendDocument(document).tracks[0].clips[0]).toMatchObject({
    gainDb: source.clip.gainDb,
    fadeInBars: source.clip.fade.durationBars,
    fadeOutBars: source.clip.fade.durationBars,
    fadeInOffsetBars: source.clip.fade.offsetBars,
    fadeOutOffsetBars: source.clip.fade.offsetBars,
    fadeInCurve: source.clip.fade.curve,
    fadeOutCurve: source.clip.fade.curve,
    fadeInCurvePosition: source.clip.fade.position,
    fadeOutCurvePosition: source.clip.fade.position,
  })
  expect(createClip("audio", 1, 8)).toMatchObject({
    gainDb: PROJECT_TEMPLATE.clip.gainDb,
    fadeInCurve: PROJECT_TEMPLATE.clip.fade.curve,
    fadeInCurvePosition: PROJECT_TEMPLATE.clip.fade.position,
  })
  track.clips = [
    { id: "legacy", kind: "audio", samplePath: "", gainDb: 0, startBar: 1, lengthBars: 8 },
  ]
  expect(projectBackendDocument(document, source).tracks[0].clips[0]).toMatchObject({
    fadeInBars: source.clip.fade.durationBars,
    fadeOutBars: source.clip.fade.durationBars,
    fadeInOffsetBars: source.clip.fade.offsetBars,
    fadeOutOffsetBars: source.clip.fade.offsetBars,
    fadeInCurve: source.clip.fade.curve,
    fadeOutCurve: source.clip.fade.curve,
    fadeInCurvePosition: source.clip.fade.position,
    fadeOutCurvePosition: source.clip.fade.position,
  })
})

it("workspace, audio metadata and MIDI insertion sample preference sources rather than duplicate literals", () => {
  const preferences = structuredClone(PREFERENCE_DEFAULTS)
  preferences.workspace.pxPerBar += 13
  preferences.workspace.snap = !preferences.workspace.snap
  preferences.midi.velocity = 79
  preferences.midi.insertLengthBeats = 2
  preferences.midi.drawLengthBeats = 0.5
  preferences.midi.noteGridBeats = 0.5
  preferences.audio.warp = false
  preferences.audio.reverse = true
  preferences.audio.transpose = 7
  expect(createWorkspaceTemplate(preferences)).toMatchObject({
    pxPerBar: preferences.workspace.pxPerBar,
    snap: preferences.workspace.snap,
  })
  preferences.workspace.gridMode = "fixed"
  preferences.workspace.fixedGridBars = 2
  expect(createWorkspaceTemplate(preferences).grid).toEqual({
    mode: "fixed",
    bars: preferences.workspace.fixedGridBars,
  })
  expect(defaultAudioClipSettings(113, { lengthBars: 2 }, preferences.audio)).toMatchObject(
    preferences.audio
  )
  const window = { sourceOffsetBeats: 0, totalBeats: 8 }
  const inserted = insertNote({
    notes: [],
    horizontalRatio: 0.15,
    verticalRatio: 0.5,
    window,
    id: "inserted",
    policy: preferences.midi,
  })
  expect(inserted.notes[0]).toMatchObject({
    startBeat: preferences.midi.noteGridBeats * 2,
    lengthBeats: preferences.midi.insertLengthBeats,
    velocity: preferences.midi.velocity,
  })
  const drawn = drawCells({
    notes: [],
    selection: [],
    firstCell: 1,
    lastCell: 2,
    pitch: 63,
    window,
    createId: () => crypto.randomUUID(),
    policy: preferences.midi,
  })
  expect(drawn.notes.map(note => [note.startBeat, note.lengthBeats, note.velocity])).toEqual([
    [preferences.midi.noteGridBeats, preferences.midi.drawLengthBeats, preferences.midi.velocity],
    [
      preferences.midi.noteGridBeats * 2,
      preferences.midi.drawLengthBeats,
      preferences.midi.velocity,
    ],
  ])
  const erased = eraseCells({
    notes: drawn.notes,
    selection: [],
    firstCell: 1,
    lastCell: 1,
    pitch: 63,
    window,
    erased: new Set(),
    policy: preferences.midi,
  })
  expect(erased.edit.notes.map(note => note.startBeat)).toEqual([
    preferences.midi.noteGridBeats * 2,
  ])
  expect(pasteNotes([], inserted.notes, () => "pasted", preferences.midi).notes[0].startBeat).toBe(
    inserted.notes[0].startBeat + preferences.midi.noteGridBeats
  )
  expect(
    transformNotes({
      notes: inserted.notes,
      selection: [0],
      kind: "resize",
      beatDelta: -99,
      pitchDelta: 0,
      window,
      policy: preferences.midi,
    }).notes[0].lengthBeats
  ).toBe(preferences.midi.noteGridBeats)
  const canonical = insertNote({
    notes: [],
    horizontalRatio: 0,
    verticalRatio: 0.5,
    window,
    id: "canonical",
  })
  expect(canonical.notes[0]).toMatchObject({
    velocity: PREFERENCE_DEFAULTS.midi.velocity,
    lengthBeats: PREFERENCE_DEFAULTS.midi.insertLengthBeats,
  })
})

it("keeps imports unopened and requires explicit project creation configuration", () => {
  const document = createUnopenedDocument()
  expect(document.name).toBe("")
  expect(document.tracks).toEqual([])
  const store = createStore<ProjectState>(() => ({
    document,
    workspace: createWorkspaceTemplate(PREFERENCE_DEFAULTS),
    session: createSessionTemplate(PREFERENCE_DEFAULTS),
  }))
  const runtime = createProjectRuntime({ store })
  expect(() => runtime.resetProject("unconfigured")).toThrow(/configureProjectCreation/)
  expect(runtime.get().document).toBe(document)
  const remove = runtime.configureProjectBackend(
    () => {
      throw new Error("Backend must remain unopened")
    },
    {
      createProject: id => ({
        document: { ...document, name: id },
        workspace: createWorkspaceTemplate(PREFERENCE_DEFAULTS),
      }),
    }
  )
  runtime.resetProject("explicit-fixture")
  expect(runtime.get().document.name).toBe("explicit-fixture")
  remove()
})

it("samples session preferences on reset and hydration, limits history dynamically and never renames saved data", () => {
  const preferences = structuredClone(PREFERENCE_DEFAULTS)
  preferences.historyCapacity = 2
  let names = { ...TEST_CREATION_NAMES }
  const store = createStore<ProjectState>(() => ({
    document: createUnopenedDocument(),
    workspace: createWorkspaceTemplate(preferences),
    session: createSessionTemplate(preferences),
  }))
  const runtime = createProjectRuntime({
    store,
    creation: {
      names: () => names,
      appearance: () => TEST_TRACK_APPEARANCE,
      preferences: () => preferences,
    },
  })
  runtime.resetProject("first")
  const originalName = runtime.get().document.name
  names = { ...names, project: "Different locale" }
  preferences.midi.keyboardOctave = 6
  preferences.midi.velocity = 47
  expect(runtime.get().document.name).toBe(originalName)
  runtime.hydrateState({
    document: { ...runtime.get().document, name: "Saved name" },
    workspace: runtime.get().workspace,
  })
  expect(runtime.get().document.name).toBe("Saved name")
  expect(runtime.get().session).toMatchObject({
    midiOctave: preferences.midi.keyboardOctave,
    midiVelocity: preferences.midi.velocity,
  })
  const bpm = runtime.get().document.transport.bpm
  for (const offset of [1, 2, 3])
    runtime.document({
      ...runtime.get().document,
      transport: { ...runtime.get().document.transport, bpm: bpm + offset },
    })
  runtime.undo()
  runtime.undo()
  expect(runtime.get().document.transport.bpm).toBe(bpm + 1)
  expect(runtime.get().session.canUndo).toBe(false)
  runtime.resetProject("second")
  expect(runtime.get().document.name).toBe(names.project)
  expect(runtime.get().session.midiVelocity).toBe(preferences.midi.velocity)
})

it("timeline growth follows injected minimum, region step and editing padding", () => {
  const policy = { minimumBars: 24, growthStepBars: 7, paddingBars: 3 }
  const document = createUnopenedDocument()
  document.markers = [{ id: "late", label: "fixture", bar: 51 }]
  const expected =
    Math.ceil((document.markers[0].bar - 1) / policy.growthStepBars) * policy.growthStepBars +
    policy.paddingBars
  expect(growTimelineBars(0, Number.NaN, policy)).toBe(policy.minimumBars)
  expect(growTimelineBars(0, 51, policy)).toBe(expected)
  expect(timelineBars(document, policy)).toBe(expected)
})
