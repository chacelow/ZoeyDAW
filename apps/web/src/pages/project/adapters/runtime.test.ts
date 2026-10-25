import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import { parseProject } from "@zoeydaw/project-core/persistence"
import { initialSession, initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import {
  createMockProjectBackend,
  createMockDocument,
  createMockWorkspace,
} from "@zoeydaw/project-runtime/testing"
import { captureProjectSave, waitForProjectSave, completeProjectSave } from "./context"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
  whenProjectBackendIdle,
  startProjectRuntime,
  setProjectStorageId,
} from "."
import type {
  BackendControlRequest,
  BackendDocumentRequest,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendTelemetry,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"
import type { ProjectState } from "@zoeydaw/project-core/types"
import { readProjectMeterLevels } from "./realtime"

const backendPhaseOnImport = useProjectState.getState().session.backend.phase

function deferredBackend({ deferNotes = false } = {}) {
  type Pending =
    | {
        kind: "document"
        request: BackendDocumentRequest
        resolve: (result: BackendResult) => void
      }
    | { kind: "control"; request: BackendControlRequest; resolve: (result: BackendResult) => void }
  const pending: Pending[] = []
  const requests: BackendDocumentRequest[] = []
  const controls: BackendControlRequest[] = []
  const notes: BackendNoteRequest[] = []
  const pendingNotes: {
    request: BackendNoteRequest
    resolve: (result: BackendNoteResult) => void
  }[] = []
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  let acceptedRevision = 0
  const panics = { allNotesOff: 0, urgentStop: 0 }
  const backend: ProjectBackend = {
    apply(request) {
      requests.push(request)
      if (request.stage === "open") {
        acceptedRevision = request.revision
        return {
          kind: "accepted",
          sessionId: request.sessionId,
          sequence: request.sequence,
          revision: acceptedRevision,
          controlGeneration: request.controlGeneration,
        }
      }
      return new Promise<BackendResult>(resolve => {
        pending.push({ kind: "document", request, resolve })
      })
    },
    control(request) {
      controls.push(request)
      return new Promise<BackendResult>(resolve => {
        pending.push({ kind: "control", request, resolve })
      })
    },
    note(request) {
      notes.push(request)
      if (!deferNotes) {
        return { kind: "accepted", sessionId: request.sessionId, sequence: request.sequence }
      }
      return new Promise<BackendNoteResult>(resolve => {
        pendingNotes.push({ request, resolve })
      })
    },
    allNotesOff() {
      panics.allNotesOff++
    },
    async urgentStop() {
      panics.urgentStop++
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      listeners.clear()
    },
  }
  function settle(kind: "accepted" | "rejected") {
    const next = pending.shift()
    if (!next) {
      throw new Error("No backend request is awaiting a response")
    }
    if (kind === "accepted") {
      if (next.kind === "document") acceptedRevision = next.request.revision
      next.resolve({
        kind,
        sessionId: next.request.sessionId,
        sequence: next.request.sequence,
        revision: acceptedRevision,
        controlGeneration: next.request.controlGeneration,
      })
    } else {
      next.resolve({
        kind,
        sessionId: next.request.sessionId,
        sequence: next.request.sequence,
        code: "rejected",
        controlGeneration: next.request.controlGeneration,
      })
    }
    return next.request
  }
  function settleNote(kind: "accepted" | "rejected") {
    const next = pendingNotes.shift()
    if (!next) throw new Error("No note edge is awaiting a response")
    if (kind === "accepted") {
      next.resolve({ kind, sessionId: next.request.sessionId, sequence: next.request.sequence })
    } else {
      next.resolve({
        kind,
        sessionId: next.request.sessionId,
        sequence: next.request.sequence,
        code: "rejected",
      })
    }
    return next.request
  }
  const publish = (frame: BackendTelemetry) => {
    for (const listener of listeners) {
      listener(frame)
    }
  }
  return {
    backend,
    requests,
    controls,
    notes,
    pending,
    pendingNotes,
    settle,
    settleNote,
    publish,
    panics,
  }
}
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

it("does not create backend resources on import, factory construction, or hydration, and isolates runtime instances", () => {
  releaseRuntime?.()
  expect(backendPhaseOnImport).toBe("idle")
  releaseRuntime = null
  let opened = 0
  let disposed = 0
  const openedBpms: number[] = []
  const backendFactory = () => {
    opened++
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request: BackendDocumentRequest) {
        if (request.stage === "open") {
          openedBpms.push(request.state.project.bpm)
        }
        return backend.apply(request)
      },
      dispose() {
        backend.dispose()
        disposed++
      },
    }
  }
  const removeDefault = configureProjectBackend(backendFactory)
  fresh()
  expect(opened).toBe(0)
  removeDefault()
  const makeStore = () =>
    create<ProjectState>(() => ({
      document: initialDocument(DEFAULT_TRACK_HEIGHT),
      workspace: initialWorkspace(),
      session: initialSession(),
    }))
  const first = createProjectRuntime({
    store: makeStore(),
    backendFactory,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  const second = createProjectRuntime({
    store: makeStore(),
    backendFactory,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  expect(opened).toBe(0)
  first.hydrateState({
    document: createMockDocument(DEFAULT_TRACK_HEIGHT),
    workspace: createMockWorkspace(),
  })
  second.hydrateState({
    document: createMockDocument(DEFAULT_TRACK_HEIGHT),
    workspace: createMockWorkspace(),
  })
  first.document({ ...first.get().document, name: "First" })
  first.document({
    ...first.get().document,
    transport: { ...first.get().document.transport, bpm: 177 },
  })
  expect(second.get().document.name).not.toBe("First")
  expect(opened).toBe(0)
  const stopFirst = first.startProjectRuntime()
  expect(opened).toBe(1)
  const edit = first.beginEdit()
  first.document({ ...first.get().document, name: "Temporary" })
  const stopSecond = second.startProjectRuntime()
  expect(first.isCurrentEdit({ ...edit, sessionId: second.get().session.backend.sessionId })).toBe(
    false
  )
  expect(second.isCurrentEdit(edit)).toBe(false)
  expect(opened).toBe(2)
  expect(openedBpms).toEqual([177, second.get().document.transport.bpm])
  expect(second.get().session.preview).toBeNull()
  stopFirst()
  expect(disposed).toBe(1)
  expect(first.get().document.name).toBe("First")
  first.endEdit(edit)
  expect(first.get().document.name).toBe("First")
  expect(second.get().session.backend.phase).toBe("ready")
  stopSecond()
  expect(disposed).toBe(2)
})

it("routes existing commands to a real injected backend and rolls rejected edits back without resetting UI preferences", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setViewport({ scrollX: 91 })
  projectActions.setFollow(false)
  projectActions.selectTracks(["trager"], "header")
  projectActions.setBpm(140)
  projectActions.setBpm(160)
  expect(useProjectState.getState().document.transport.bpm).toBe(160)
  expect(remote.requests[1].state.project.bpm).toBe(140)
  expect(remote.requests[1].state.project).not.toHaveProperty("scrollX")
  remote.settle("accepted")
  await Promise.resolve()
  expect(remote.requests[2].state.project.bpm).toBe(160)
  remote.settle("rejected")
  await Promise.resolve()
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
  expect(useProjectState.getState().workspace).toMatchObject({ scrollX: 91, follow: false })
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["trager"])
  expect(useProjectState.getState().session.backend.error).toBe("rejected")
  expect(remote.requests.at(-1)?.stage).toBe("recover")
  remote.settle("accepted")
  await Promise.resolve()
  expect(await whenProjectBackendIdle()).toBe(true)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(remote.requests.at(-1)?.stage).toBe("commit")
  remote.settle("accepted")
  await Promise.resolve()
})

it("keeps canonical previews out of snapshots and journals recorded notes across cancellation", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.toggleRecording()
  remote.settle("accepted")
  await Promise.resolve()
  const source = useProjectState.getState().document.tracks
  const token = projectActions.beginPreview()
  const changed = source.map(track =>
    track.id === "trager" ? { ...track, name: "Deferred edit" } : track
  )
  projectActions.previewTracks(token, changed)
  expect(serializeProject()).not.toContain("Deferred edit")
  projectActions.noteOn(82)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).not.toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 82 })]),
  })
  projectActions.cancelPreview(token)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 82 })]),
  })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.name
  ).toBe("trager")
  while (remote.pending.length) {
    remote.settle("accepted")
    await Promise.resolve()
  }
  expect(await whenProjectBackendIdle()).toBe(true)
})

it("does not clear dirty until accepted, and fences delayed save and old project responses", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(155)
  const saving = waitForProjectSave(captureProjectSave(), new AbortController().signal)
  const rejected = expect(saving).rejects.toThrow(/changed/)
  expect(useProjectState.getState().session.dirty).toBe(true)
  const old = remote.pending[0]
  fresh()
  old.resolve({
    kind: "rejected",
    sessionId: old.request.sessionId,
    sequence: old.request.sequence,
    controlGeneration: old.request.controlGeneration,
    code: "rejected",
  })
  await Promise.resolve()
  await rejected
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.backend.error).toBeNull()
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("cancels a legacy edit without swallowing independent recording, preserving the viewport", () => {
  projectActions.toggleRecording()
  projectActions.beginEdit()
  projectActions.setBpm(145)
  projectActions.setViewport({ scrollX: 75 })
  projectActions.noteOn(80)
  projectActions.cancelEdit()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)

  expect(useProjectState.getState().workspace.scrollX).toBe(75)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 80 })]),
  })
})

it("commits the exact preview once and keeps viewport scroll outside undo history", () => {
  const source = useProjectState.getState().document.tracks
  const token = projectActions.beginPreview()
  const proposed = source.map(track =>
    track.id === "trager" ? { ...track, name: "Renamed" } : track
  )
  const canonical = projectActions.previewTracks(token, proposed)
  expect(canonical).not.toBeNull()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.name
  ).toBe("trager")
  projectActions.commitPreview(token)
  expect(useProjectState.getState().document.tracks).toBe(canonical)
  projectActions.commitPreview(token)
  projectActions.setViewport({ pxPerBar: 54, scrollX: 44, scrollY: 37 })
  projectActions.undo()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.name
  ).toBe("trager")
  expect(useProjectState.getState().workspace).toMatchObject({
    pxPerBar: 54,
    scrollX: 44,
    scrollY: 37,
  })
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("invalidates preview tokens when replacing backend sessions", () => {
  const token = projectActions.beginPreview()
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  expect(projectActions.previewMarkers(token, [{ id: "late", bar: 4, label: "Late" }])).toBeNull()
  projectActions.commitPreview(token)
  expect(useProjectState.getState().session.preview).toBeNull()
  expect(useProjectState.getState().document.markers.some(marker => marker.id === "late")).toBe(
    false
  )
})

it("disposes backend resources on the last page lease and reopens a fresh epoch", async () => {
  releaseRuntime?.()
  releaseRuntime = null
  const instances: { disposed: boolean; requests: BackendDocumentRequest[] }[] = []
  restore = configureProjectBackend(() => {
    const instance: { disposed: boolean; requests: BackendDocumentRequest[] } = {
      disposed: false,
      requests: [],
    }
    instances.push(instance)
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request) {
        instance.requests.push(request)
        return backend.apply(request)
      },
      dispose() {
        backend.dispose()
        instance.disposed = true
      },
    }
  })
  const releaseOne = startProjectRuntime()
  const firstEpoch = useProjectState.getState().session.backend.sessionId
  const releaseTwo = startProjectRuntime()
  releaseOne()
  expect(instances[0].disposed).toBe(false)
  releaseTwo()
  expect(instances[0].disposed).toBe(true)
  expect(useProjectState.getState().session.backend.phase).toBe("idle")
  const releaseNext = startProjectRuntime()
  expect(instances).toHaveLength(2)
  expect(useProjectState.getState().session.backend.sessionId).not.toBe(firstEpoch)
  projectActions.setBpm(153)
  expect(instances[1].requests.at(-1)?.state.project.bpm).toBe(153)
  releaseNext()
  expect(instances[1].disposed).toBe(true)
  expect(await whenProjectBackendIdle()).toBe(false)
})

it("accepts a captured revision after later acknowledgements without clearing newer edits", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(145)
  const capture = captureProjectSave()
  projectActions.setBpm(165)
  remote.settle("accepted")
  await Promise.resolve()
  remote.settle("accepted")
  await Promise.resolve()
  await waitForProjectSave(capture, new AbortController().signal)
  completeProjectSave(capture)
  expect(capture.document.transport.bpm).toBe(145)
  expect(useProjectState.getState().document.transport.bpm).toBe(165)
  expect(useProjectState.getState().session.dirty).toBe(true)
})

it("does not cancel a pending save just because the unhistoried viewport changed", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(147)
  const capture = captureProjectSave()
  const saved = waitForProjectSave(capture, new AbortController().signal)
  projectActions.setViewport({ scrollX: 192 })
  remote.settle("accepted")
  await saved
  completeProjectSave(capture)
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().workspace.scrollX).toBe(192)
})

it("captures committed values rather than temporary numeric and workspace edits", async () => {
  projectActions.beginEdit()
  projectActions.setBpm(170)
  projectActions.setFollow(false)
  const capture = captureProjectSave()
  expect(parseProject(serializeProject()).document.transport.bpm).toBe(120)
  expect(capture.document.transport.bpm).toBe(120)
  expect(capture.workspace.follow).toBe(true)
  await waitForProjectSave(capture, new AbortController().signal)
  completeProjectSave(capture)
  projectActions.cancelEdit()
  expect(useProjectState.getState().session.dirty).toBe(false)
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

it("keeps each edit owner's backend id stable and its undo history separate", () => {
  const requests: BackendDocumentRequest[] = []
  restore = configureProjectBackend(() => {
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request) {
        requests.push(request)
        return backend.apply(request)
      },
    }
  })
  const first = projectActions.beginEdit("bpm")
  projectActions.setBpm(141)
  projectActions.setBpm(142)
  const second = projectActions.beginEdit("track-volume")
  expect(second.id).not.toBe(first.id)
  expect(first.sessionId).toBe(second.sessionId)
  expect(
    requests.filter(request => request.editId === first.id).map(request => request.stage)
  ).toEqual(["preview", "preview", "commit"])
  projectActions.setBpm(143)
  projectActions.endEdit(first)
  expect(useProjectState.getState().document.transport.bpm).toBe(143)
  projectActions.endEdit(second)
  expect(
    requests.filter(request => request.editId === second.id).map(request => request.stage)
  ).toEqual(["preview", "commit"])
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(142)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("ignores stale edit tokens across owners and project sessions", () => {
  const old = projectActions.beginEdit("bpm")
  projectActions.setBpm(151)
  fresh()
  const current = projectActions.beginEdit("bpm")
  expect(current.sessionId).not.toBe(old.sessionId)
  projectActions.setBpm(152)
  projectActions.cancelEdit(old)
  projectActions.endEdit(old)
  expect(useProjectState.getState().document.transport.bpm).toBe(152)
  projectActions.endEdit(current)
  expect(useProjectState.getState().session.canUndo).toBe(true)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("ends an inline edit before a canvas preview and cancels the preview before the next inline edit", () => {
  const inline = projectActions.beginEdit("bpm")
  projectActions.setBpm(147)
  const preview = projectActions.beginPreview()
  expect(useProjectState.getState().session.canUndo).toBe(true)
  projectActions.previewMarkers(preview, [{ id: "uncommitted", bar: 3, label: "Uncommitted" }])
  const next = projectActions.beginEdit("bpm")
  expect(next.id).not.toBe(inline.id)
  expect(useProjectState.getState().session.preview).toBeNull()
  projectActions.commitPreview(preview)
  expect(
    useProjectState.getState().document.markers.some(marker => marker.id === "uncommitted")
  ).toBe(false)
  projectActions.setBpm(148)
  projectActions.cancelEdit(inline)
  projectActions.endEdit(next)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(147)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("preserves nested synchronous menu edits as one transaction", () => {
  const outer = projectActions.beginEdit()
  projectActions.setBpm(135)
  const inner = projectActions.beginEdit()
  expect(inner).toBe(outer)
  projectActions.setBpm(136)
  projectActions.endEdit()
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.endEdit()
  expect(useProjectState.getState().session.canUndo).toBe(true)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("releases rejected inline ownership without letting its token cancel the next edit", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  const rejected = projectActions.beginEdit("bpm")
  projectActions.setBpm(160)
  remote.settle("rejected")
  await Promise.resolve()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  remote.settle("accepted")
  await Promise.resolve()
  const current = projectActions.beginEdit("bpm")
  projectActions.setBpm(170)
  projectActions.cancelEdit(rejected)
  projectActions.endEdit(rejected)
  expect(useProjectState.getState().document.transport.bpm).toBe(170)
  projectActions.endEdit(current)
  expect(useProjectState.getState().session.canUndo).toBe(true)
})

it("does not clear dirty before the captured revision is accepted or after cancellation", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(151)
  const capture = captureProjectSave()
  const abort = new AbortController()
  const saved = waitForProjectSave(capture, abort.signal)
  const cancelled = expect(saved).rejects.toMatchObject({ name: "AbortError" })
  abort.abort()
  await cancelled
  expect(useProjectState.getState().session.dirty).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.dirty).toBe(true)
})

it("does not promote a temporary control edit when replacing the backend", () => {
  const edit = projectActions.beginEdit("gain-editor")
  projectActions.setBpm(183)
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(remote.requests[0].state.project.bpm).toBe(120)
  projectActions.endEdit(edit)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("does not let an older backend cleanup replace the current installation", async () => {
  const first = deferredBackend()
  const second = deferredBackend()
  const removeFirst = configureProjectBackend(() => first.backend)
  const removeSecond = configureProjectBackend(() => second.backend)
  restore = () => {
    removeSecond()
    removeFirst()
  }
  const epoch = useProjectState.getState().session.backend.sessionId
  removeFirst()
  expect(useProjectState.getState().session.backend.sessionId).toBe(epoch)
  projectActions.setBpm(155)
  expect(second.requests.at(-1)?.state.project.bpm).toBe(155)
  second.settle("accepted")
  await Promise.resolve()
  removeSecond()
  projectActions.setBpm(165)
  expect(useProjectState.getState().session.backend.pending).toBe(0)
  expect(useProjectState.getState().session.backend.error).toBeNull()
})

it("rejects edits visibly when the backend could not initialize instead of silently dropping them", async () => {
  restore = configureProjectBackend(() => {
    throw new Error("Unavailable backend")
  })
  expect(useProjectState.getState().session.backend.error).toBe("connection")
  projectActions.setBpm(185)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.backend.pending).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(await whenProjectBackendIdle()).toBe(false)
})

it("opens external-backend projects without demo media and leaves empty audio clips silent", () => {
  restore = configureProjectBackend(createMockProjectBackend)
  setProjectStorageId("external-empty")
  expect(useProjectState.getState().document.tracks.map(track => track.kind)).toEqual([
    "audio",
    "main",
  ])
  const track = useProjectState.getState().document.tracks.find(track => track.kind === "audio")
  if (!track) {
    throw new Error("Missing audio track")
  }
  projectActions.createClip(track.id, "audio", 1, 4)
  const clip = useProjectState.getState().document.tracks.find(item => item.id === track.id)
    ?.clips[0]
  expect(clip).toMatchObject({ kind: "audio", sourceId: null })
  const stop = startProjectRuntime()
  try {
    projectActions.togglePlay()
    expect(readProjectMeterLevels({ kind: "track", trackId: track.id })).toEqual([
      -Infinity,
      -Infinity,
    ])
  } finally {
    stop()
  }
})

it("initializes each project from its backend registration and restores the previous initializer", () => {
  const removeFirst = configureProjectBackend(createMockProjectBackend, {
    createProject: projectId => ({
      document: { ...initialDocument(DEFAULT_TRACK_HEIGHT), name: projectId },
      workspace: initialWorkspace(),
    }),
  })
  const removeSecond = configureProjectBackend(createMockProjectBackend)
  restore = () => {
    removeSecond()
    removeFirst()
  }
  setProjectStorageId("external-second")
  expect(useProjectState.getState().document.name).toBe(initialDocument(DEFAULT_TRACK_HEIGHT).name)
  removeSecond()
  setProjectStorageId("external-first")
  expect(useProjectState.getState().document.name).toBe("external-first")
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("does not promote unfinished numeric edits when the last runtime lease is released", () => {
  releaseRuntime?.()
  releaseRuntime = null
  const stop = startProjectRuntime()
  const token = projectActions.beginEdit("bpm")
  projectActions.setBpm(183)
  stop()
  const stopNext = startProjectRuntime()
  try {
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.cancelEdit(token)
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  } finally {
    stopNext()
  }
})

it("keeps saved workspace preferences clean after a rejected document edit", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setFollow(false)
  const capture = captureProjectSave()
  await waitForProjectSave(capture, new AbortController().signal)
  completeProjectSave(capture)
  expect(useProjectState.getState().session.dirty).toBe(false)
  projectActions.setBpm(183)
  remote.settle("rejected")
  await Promise.resolve()
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().workspace.follow).toBe(false)
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().session.canUndo).toBe(true)
  projectActions.undo()
  expect(useProjectState.getState().workspace.follow).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
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

it("retains independent recorded notes when the last lease cancels a numeric edit", () => {
  projectActions.toggleRecording()
  projectActions.beginEdit("bpm")
  projectActions.setBpm(183)
  projectActions.noteOn(85)
  releaseRuntime?.()
  releaseRuntime = null
  expect(useProjectState.getState().session.backend.phase).toBe("idle")
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 85 })]),
  })
  projectActions.undo()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).not.toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 85 })]),
  })
})

it("starts independently injected runtime projects without fabricated demo media", () => {
  const store = createStore<ProjectState>(() => ({
    document: initialDocument(DEFAULT_TRACK_HEIGHT),
    workspace: initialWorkspace(),
    session: initialSession(),
  }))
  const runtime = createProjectRuntime({
    store,
    backendFactory: createMockProjectBackend,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  runtime.resetProject("native-bootstrap")
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  expect(runtime.get().document.tracks[0]).toMatchObject({
    name: "1 Audio",
    output: "main",
    volumeDb: 0,
    pan: 0,
    armed: false,
  })
  expect(runtime.get().document.media).toEqual([])
  expect(runtime.get().document.tracks.flatMap(track => track.clips)).toEqual([])
  expect(runtime.get().session.backend.phase).toBe("idle")
  const before = runtime.get()
  const buses = before.document.tracks.filter(track => track.kind === "main")
  runtime.tracks(buses)
  runtime.document({ ...before.document, tracks: buses })
  expect(runtime.get()).toBe(before)
  const token = runtime.beginPreview()
  expect(runtime.previewTracks(token, buses)).toBeNull()
  expect(runtime.getEffectiveDocument()).toBe(before.document)
  runtime.cancelPreview(token)
  expect(runtime.get().session.canUndo).toBe(false)
})

it("normalizes custom reset and hydration seeds before backend opening, without mutating the seed", async () => {
  const document = initialDocument(DEFAULT_TRACK_HEIGHT)
  document.tracks = document.tracks.filter(track => track.kind === "main")
  document.name = "Legacy project"
  const seed = { document, workspace: initialWorkspace() }
  const store = createStore<ProjectState>(() => ({ ...seed, session: initialSession() }))
  const requests: BackendDocumentRequest[] = []
  const runtime = createProjectRuntime({
    store,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
    createProject: () => seed,
    backendFactory: () => {
      const backend = createMockProjectBackend()
      return {
        ...backend,
        apply(request) {
          requests.push(request)
          return backend.apply(request)
        },
      }
    },
  })
  runtime.resetProject("legacy-reset")
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  runtime.hydrateState(seed)
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  const release = runtime.startProjectRuntime()
  try {
    await runtime.whenProjectBackendIdle()
    expect(requests[0].state.project.tracks.map(track => track.kind)).toEqual(["audio", "main"])
    await runtime.replaceProject(seed, new AbortController().signal)
    expect(requests.at(-1)?.state.project.tracks.map(track => track.kind)).toEqual([
      "audio",
      "main",
    ])
    expect(runtime.get().document.name).toBe("Legacy project")
    expect(document.tracks.map(track => track.kind)).toEqual(["main"])
    expect(runtime.get().document.tracks[0].clips).toEqual([])
  } finally {
    release()
  }
})

it("nests a new group inside its parent and lists every child once", () => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
  projectActions.groupTracks(["trager", "sidechain"])
  const tracks = useProjectState.getState().document.tracks
  const outer = tracks.find(track => track.id === "drums-group")
  const inner = tracks.find(track => track.kind === "group" && track.id !== "drums-group")
  expect(inner?.output).toBe("drums-group")
  expect(inner?.childTrackIds).toEqual(["trager", "sidechain"])
  expect(outer?.childTrackIds).toEqual([inner?.id])
  expect(tracks.filter(track => track.id === "sidechain")).toHaveLength(1)
  expect(tracks.find(track => track.id === "sidechain")?.output).toBe(inner?.id)
})
