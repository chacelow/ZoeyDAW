import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
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
} from "."
import type { BackendDocumentRequest } from "@zoeydaw/project-core/backend"
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
