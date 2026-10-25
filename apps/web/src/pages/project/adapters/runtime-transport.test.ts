import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import {
  createMockProjectBackend,
  createMockDocument,
  createMockWorkspace,
} from "@zoeydaw/project-runtime/testing"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  useProjectState,
  startProjectRuntime,
} from "."

import { deferredBackend } from "./runtime-test-backend"

const fresh = () =>
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
let restore: (() => void) | null = null
let releaseRuntime: (() => void) | null = null
beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  localStorage.clear()
  fresh()
  releaseRuntime = startProjectRuntime()
})
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = null
  restore?.()
  restore = null
})

it("preserves short MIDI note edges and does not resurrect a released key after rejection", async () => {
  const remote = deferredBackend({ deferNotes: true })
  restore = configureProjectBackend(() => remote.backend)
  const before = useProjectState.getState().document
  projectActions.noteOn(80)
  projectActions.noteOff(80)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  expect(remote.notes).toHaveLength(1)
  const down = remote.notes[0]
  expect(down.note).toMatchObject({ trackId: "trager", pitch: 80, on: true })
  expect(down.note.noteId).not.toBe("")
  remote.settleNote("accepted")
  await Promise.resolve()
  expect(remote.notes).toHaveLength(2)
  expect(remote.notes[1]).toMatchObject({
    sessionId: down.sessionId,
    sequence: down.sequence + 1,
    note: { ...down.note, on: false, velocity: 0 },
  })
  remote.settleNote("rejected")
  await Promise.resolve()
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  expect(useProjectState.getState().session.backend.error).toBe("rejected")
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(remote.requests.map(request => request.stage)).toEqual(["open"])
  expect(remote.controls).toEqual([])
  expect(remote.pendingNotes).toHaveLength(0)
  expect(remote.panics).toEqual({ allNotesOff: 1, urgentStop: 0 })
})

it("panics rejected notes without stopping arrangement playback or changing history", async () => {
  const remote = deferredBackend({ deferNotes: true })
  restore = configureProjectBackend(() => remote.backend)
  projectActions.togglePlay()
  remote.settle("accepted")
  await Promise.resolve()
  const before = useProjectState.getState()
  expect(before.session.playing).toBe(true)
  projectActions.noteOn(84)
  projectActions.noteOff(84)
  remote.settleNote("accepted")
  await Promise.resolve()
  remote.settleNote("rejected")
  await Promise.resolve()
  const after = useProjectState.getState()
  expect(after.session.playing).toBe(true)
  expect(after.session.activeMidiNotes).toEqual([])
  expect(after.session.backend.error).toBe("rejected")
  expect(after.session.backend.acceptedRevision).toBe(before.session.backend.acceptedRevision)
  expect(after.session.canUndo).toBe(before.session.canUndo)
  expect(after.document).toBe(before.document)
  expect(remote.panics).toEqual({ allNotesOff: 1, urgentStop: 0 })
  expect(remote.requests.map(request => request.stage)).toEqual(["open"])
  expect(remote.controls).toHaveLength(1)
})

it("releases the original MIDI track and note id after arm and selection change", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.noteOn(81)
  expect(remote.notes).toHaveLength(1)
  const down = remote.notes[0]
  expect(down.note).toMatchObject({ trackId: "trager", pitch: 81, on: true })
  projectActions.updateTrack("trager", { armed: false, monitor: "off" })
  projectActions.selectTracks(["sidechain"], "header")
  while (remote.pending.length) {
    remote.settle("accepted")
    await Promise.resolve()
  }
  const documentRequests = remote.requests.length
  const controlRequests = remote.controls.length
  projectActions.noteOff(81)
  expect(remote.notes).toHaveLength(2)
  expect(remote.notes[1].note).toEqual({ ...down.note, on: false, velocity: 0 })
  expect(remote.requests).toHaveLength(documentRequests)
  expect(remote.controls).toHaveLength(controlRequests)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("routes monitored MIDI notes without requiring arm and excludes monitor-off tracks", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.updateTrack("trager", { armed: true, monitor: "off" })
  projectActions.updateTrack("sidechain", { armed: false, monitor: "in" })
  while (remote.pending.length) {
    remote.settle("accepted")
    await Promise.resolve()
  }
  const documentRequests = remote.requests.length
  projectActions.noteOn(82)
  expect(remote.notes).toHaveLength(1)
  expect(remote.notes[0].note).toMatchObject({
    trackId: "sidechain",
    pitch: 82,
    velocity: useProjectState.getState().session.midiVelocity,
    on: true,
  })
  projectActions.noteOff(82)
  expect(remote.notes).toHaveLength(2)
  expect(remote.notes[1].note).toEqual({ ...remote.notes[0].note, on: false, velocity: 0 })
  expect(remote.requests).toHaveLength(documentRequests)
  expect(remote.controls).toEqual([])
})

it("sends transport through narrow controls without document, revision, or history changes", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  const before = useProjectState.getState()
  projectActions.togglePlay()
  expect(remote.requests.map(request => request.stage)).toEqual(["open"])
  expect(remote.controls).toHaveLength(1)
  expect(remote.controls[0]).toEqual({
    protocolVersion: 2,
    sessionId: before.session.backend.sessionId,
    sequence: remote.requests[0].sequence + 1,
    controlGeneration: (BigInt(remote.requests[0].controlGeneration) + 1n).toString(),
    control: {
      playing: true,
      recording: false,
      seekBar: 1,
      seekGeneration: 0,
      metronome: false,
    },
  })
  remote.settle("accepted")
  await Promise.resolve()
  const after = useProjectState.getState()
  expect(after.document).toBe(before.document)
  expect(after.session.backend.acceptedRevision).toBe(before.session.backend.acceptedRevision)
  expect(after.session.canUndo).toBe(before.session.canUndo)
  expect(after.session.dirty).toBe(before.session.dirty)
  projectActions.setMetronome(true)
  expect(remote.controls).toHaveLength(2)
  expect(remote.controls[1].control.metronome).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().workspace.metronome).toBe(true)
})

it("does not record optimistic seek positions before backend acceptance", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.toggleRecording()
  remote.settle("accepted")
  await Promise.resolve()
  const before = useProjectState.getState().document
  projectActions.seekBar(32)
  projectActions.noteOn(82)
  expect(useProjectState.getState().document).toBe(before)
  remote.settle("rejected")
  await Promise.resolve()
  while (remote.pending.length) {
    remote.settle("accepted")
    await Promise.resolve()
  }
  expect(useProjectState.getState().document).toBe(before)
  projectActions.noteOff(82)
  while (remote.pending.length) {
    remote.settle("accepted")
    await Promise.resolve()
  }
  projectActions.noteOn(83)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 83 })]),
  })
  expect(
    useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .some(clip => clip.startBar === 32)
  ).toBe(false)
})

it("stops recording on accepted record-off even before the next telemetry frame", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  const stop = startProjectRuntime()
  try {
    projectActions.toggleRecording()
    while (remote.pending.length) {
      remote.settle("accepted")
      await Promise.resolve()
    }
    const command = remote.controls.at(-1)
    if (!command) {
      throw new Error("Missing accepted play request")
    }
    remote.publish({
      sessionId: command.sessionId,
      sequence: 1,
      appliedSequence: command.sequence,
      controlGeneration: command.controlGeneration,
      clock: { kind: "musical", bar: 1, barsPerSecond: 0.5 },
      playing: true,
      recording: true,
    })
    projectActions.noteOn(80)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
    ).toMatchObject({
      notes: expect.arrayContaining([expect.objectContaining({ pitch: 80 })]),
    })
    while (remote.pending.length) {
      remote.settle("accepted")
      await Promise.resolve()
    }
    projectActions.toggleRecording()
    while (remote.pending.length) {
      remote.settle("accepted")
      await Promise.resolve()
    }
    const before = useProjectState.getState().document
    projectActions.noteOn(81)
    expect(useProjectState.getState().document).toBe(before)
  } finally {
    stop()
  }
})
