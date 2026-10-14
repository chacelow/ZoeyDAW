// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import { parseProject } from "@/pages/project/model/persistence"
import { initialSession } from "../stores/useProjectState"
import { initialDocument } from "../stores/slices/document"
import { initialWorkspace } from "../stores/slices/workspace"
import { createProjectRuntime } from "./runtime"
import { createMockProjectBackend } from "./backend/mock"
import { createMockDocument, createMockWorkspace } from "./fixtures"
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
  BackendRequest,
  BackendResult,
  BackendTelemetry,
  ProjectBackend,
} from "../model/backend"
import type { ProjectState } from "../model/types"

const backendPhaseOnImport = useProjectState.getState().session.backend.phase

function deferredBackend() {
  const pending: { request: BackendRequest; resolve: (result: BackendResult) => void }[] = []
  const requests: BackendRequest[] = []
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  const backend: ProjectBackend = {
    apply(request) {
      requests.push(request)
      if (request.stage === "open") {
        return {
          kind: "accepted",
          sessionId: request.sessionId,
          sequence: request.sequence,
          revision: 0,
        }
      }
      return new Promise<BackendResult>(resolve => {
        pending.push({ request, resolve })
      })
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
      next.resolve({
        kind,
        sessionId: next.request.sessionId,
        sequence: next.request.sequence,
        revision: next.request.revision,
      })
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
  return { backend, requests, pending, settle, publish }
}
const fresh = () =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
let restore: (() => void) | null = null
let releaseRuntime: (() => void) | null = null
beforeEach(() => {
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
    return {
      apply(request: BackendRequest): BackendResult {
        if (request.stage === "open") {
          openedBpms.push(request.state.project.bpm)
        }
        return {
          kind: "accepted",
          sessionId: request.sessionId,
          sequence: request.sequence,
          revision: request.revision,
        }
      },
      subscribe: () => () => {},
      dispose() {
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
      document: initialDocument(),
      workspace: initialWorkspace(),
      session: initialSession(),
    }))
  const first = createProjectRuntime({ store: makeStore(), backendFactory })
  const second = createProjectRuntime({ store: makeStore(), backendFactory })
  expect(opened).toBe(0)
  first.hydrateState({ document: createMockDocument(), workspace: createMockWorkspace() })
  second.hydrateState({ document: createMockDocument(), workspace: createMockWorkspace() })
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
  projectActions.togglePlay()
  remote.settle("accepted")
  await Promise.resolve()
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
  projectActions.saveSnapshot()
  expect(useProjectState.getState().session.dirty).toBe(true)
  const old = remote.pending[0]
  fresh()
  old.resolve({
    kind: "rejected",
    sessionId: old.request.sessionId,
    sequence: old.request.sequence,
    code: "rejected",
  })
  await Promise.resolve()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.backend.error).toBeNull()
  expect(useProjectState.getState().session.dirty).toBe(false)
})

it("cancels a legacy edit without swallowing independent recording, preserving the viewport", () => {
  projectActions.toggleRecording()
  projectActions.togglePlay()
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
  const instances: { disposed: boolean; requests: BackendRequest[] }[] = []
  restore = configureProjectBackend(() => {
    const instance: { disposed: boolean; requests: BackendRequest[] } = {
      disposed: false,
      requests: [],
    }
    instances.push(instance)
    return {
      apply(request) {
        instance.requests.push(request)
        return {
          kind: "accepted",
          sessionId: request.sessionId,
          sequence: request.sequence,
          revision: request.revision,
        }
      },
      subscribe: () => () => {},
      dispose() {
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

it("persists the requested accepted revision despite later edits, without clearing newer dirty state", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(145)
  projectActions.saveSnapshot()
  projectActions.setBpm(165)
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.dirty).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(145)
})

it("does not cancel a pending save just because the unhistoried viewport changed", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(147)
  projectActions.saveSnapshot()
  projectActions.setViewport({ scrollX: 192 })
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().workspace.scrollX).toBe(192)
  projectActions.setBpm(167)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(147)
})

it("saves committed values rather than a numeric gesture's temporary values", () => {
  projectActions.beginEdit()
  projectActions.setBpm(170)
  expect(parseProject(serializeProject()).document.transport.bpm).toBe(120)
  projectActions.saveSnapshot()
  projectActions.cancelEdit()
  expect(useProjectState.getState().session.dirty).toBe(false)
  projectActions.setBpm(175)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("does not resurrect a released MIDI key when its backend command is rejected", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.noteOn(80)
  remote.settle("accepted")
  await Promise.resolve()
  projectActions.noteOff(80)
  remote.settle("rejected")
  await Promise.resolve()
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  expect(remote.requests.at(-1)).toMatchObject({
    stage: "recover",
    state: { control: { heldNotes: [] } },
  })
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("keeps each edit owner's backend id stable and its undo history separate", () => {
  const requests: BackendRequest[] = []
  restore = configureProjectBackend(() => ({
    apply(request) {
      requests.push(request)
      return {
        kind: "accepted",
        sessionId: request.sessionId,
        sequence: request.sequence,
        revision: request.revision,
      }
    },
    subscribe() {
      return () => {}
    },
    dispose() {},
  }))
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

it("writes a pending save only after its revision is accepted", async () => {
  const remote = deferredBackend()
  restore = configureProjectBackend(() => remote.backend)
  projectActions.setBpm(151)
  projectActions.saveSnapshot()
  expect(projectActions.restoreSnapshot()).toBe(false)
  expect(useProjectState.getState().document.transport.bpm).toBe(151)
  expect(useProjectState.getState().session.dirty).toBe(true)
  remote.settle("accepted")
  await Promise.resolve()
  expect(useProjectState.getState().session.dirty).toBe(false)
  expect(useProjectState.getState().session.snapshotError).toBeNull()
  projectActions.setBpm(161)
  expect(projectActions.restoreSnapshot()).toBe(true)
  expect(useProjectState.getState().document.transport.bpm).toBe(151)
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
  expect(useProjectState.getState().document.tracks.map(track => track.id)).toEqual(["main"])
  projectActions.addTrack("audio")
  const track = useProjectState.getState().document.tracks.find(track => track.kind === "audio")
  if (!track) {
    throw new Error("Missing audio track")
  }
  projectActions.createClip(track.id, "audio", 1, 4)
  const clip = useProjectState.getState().document.tracks.find(item => item.id === track.id)
    ?.clips[0]
  expect(clip).toMatchObject({ kind: "audio", samplePath: "" })
  const stop = startProjectRuntime()
  try {
    projectActions.togglePlay()
    expect(useProjectState.getState().session.levels[track.id]).toEqual([-60, -60])
  } finally {
    stop()
  }
})

it("initializes each project from its backend registration and restores the previous initializer", () => {
  const removeFirst = configureProjectBackend(createMockProjectBackend, {
    createProject: projectId => ({
      document: { ...initialDocument(), name: projectId },
      workspace: initialWorkspace(),
    }),
  })
  const removeSecond = configureProjectBackend(createMockProjectBackend)
  restore = () => {
    removeSecond()
    removeFirst()
  }
  setProjectStorageId("external-second")
  expect(useProjectState.getState().document.name).toBe(initialDocument().name)
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
  projectActions.saveSnapshot()
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
  projectActions.togglePlay()
  remote.settle("accepted")
  await Promise.resolve()
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
    projectActions.togglePlay()
    while (remote.pending.length) {
      remote.settle("accepted")
      await Promise.resolve()
    }
    const command = remote.requests.at(-1)
    if (!command) {
      throw new Error("Missing accepted play request")
    }
    remote.publish({
      sessionId: command.sessionId,
      sequence: 1,
      appliedSequence: command.sequence,
      clock: { kind: "musical", bar: 1, barsPerSecond: 0.5 },
      playing: true,
      recording: true,
      levels: {},
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
  projectActions.togglePlay()
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
    document: initialDocument(),
    workspace: initialWorkspace(),
    session: initialSession(),
  }))
  const runtime = createProjectRuntime({ store, backendFactory: createMockProjectBackend })
  runtime.resetProject("native-bootstrap")
  expect(runtime.get().document.tracks.map(track => track.id)).toEqual(["main"])
  expect(runtime.get().document.tracks.flatMap(track => track.clips)).toEqual([])
  expect(runtime.get().session.backend.phase).toBe("idle")
})
