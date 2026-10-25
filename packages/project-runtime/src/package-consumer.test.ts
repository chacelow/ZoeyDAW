import { expect, it, vi } from "vitest"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import { createProjectStore } from "@zoeydaw/project-runtime/store"
import { initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { createMockProjectBackend } from "@zoeydaw/project-runtime/testing"
import * as projection from "./backend/projection"
import { createMockDocument } from "./testing/fixtures"
import type {
  BackendControlRequest,
  BackendDocumentRequest,
  BackendNoteRequest,
} from "@zoeydaw/project-core/backend"

function consumer(defaultTrackHeight: number, document = initialDocument(defaultTrackHeight)) {
  const requests: BackendDocumentRequest[] = []
  const controls: BackendControlRequest[] = []
  const notes: BackendNoteRequest[] = []
  const store = createProjectStore({
    document,
    workspace: initialWorkspace(),
  })
  const runtime = createProjectRuntime({
    store,
    defaultTrackHeight,
    backendFactory: () => {
      const backend = createMockProjectBackend()
      return {
        ...backend,
        apply: (request: BackendDocumentRequest) => {
          requests.push(request)
          return backend.apply(request)
        },
        control: (request: BackendControlRequest) => {
          controls.push(request)
          return backend.control(request)
        },
        note: (request: BackendNoteRequest) => {
          notes.push(request)
          return backend.note(request)
        },
      }
    },
  })
  return { store, runtime, requests, controls, notes }
}

it("sends the displayed mono input default for legacy audio tracks without overriding an explicit channel", () => {
  const document = initialDocument(108)
  const audio = document.tracks.find(track => track.kind === "audio")
  if (!audio) throw new Error("Missing audio track")
  delete audio.inputChannel
  expect(
    projection.projectBackendDocument(document).tracks.find(track => track.id === audio.id)
      ?.inputChannel
  ).toBe("1")
  audio.inputChannel = "5-6"
  expect(
    projection.projectBackendDocument(document).tracks.find(track => track.id === audio.id)
      ?.inputChannel
  ).toBe("5-6")
  delete audio.inputChannel
  audio.input = "none"
  expect(
    projection.projectBackendDocument(document).tracks.find(track => track.id === audio.id)
      ?.inputChannel
  ).toBeNull()
})

it("isolates preview, history, backend sequences and lease disposal between consumers", async () => {
  const a = consumer(72)
  const b = consumer(144)
  const stopA = a.runtime.startProjectRuntime()
  const stopB = b.runtime.startProjectRuntime()
  try {
    await a.runtime.whenProjectBackendIdle()
    await b.runtime.whenProjectBackendIdle()
    const bDocument = b.store.getState().document
    const bRequests = [...b.requests]
    const token = a.runtime.beginPreview()
    const marker = { id: "a-marker", label: "A", bar: 2 }
    a.runtime.previewMarkers(token, [marker])
    expect(a.store.getState().session.preview).not.toBeNull()
    a.runtime.commitPreview(token)
    await a.runtime.whenProjectBackendIdle()
    expect(a.store.getState().document.markers).toEqual([marker])
    expect(a.store.getState().session.canUndo).toBe(true)
    a.runtime.undo()
    await a.runtime.whenProjectBackendIdle()
    expect(a.store.getState().document.markers).toEqual([])
    expect(b.store.getState().document).toBe(bDocument)
    expect(b.store.getState().session.canUndo).toBe(false)
    expect(b.requests).toEqual(bRequests)

    const stale = a.runtime.beginPreview()
    a.runtime.previewMarkers(stale, [marker])
    stopA()
    expect(a.runtime.previewMarkers(stale, [marker])).toBeNull()
    a.runtime.commitPreview(stale)
    expect(a.store.getState().document.markers).toEqual([])
    b.runtime.document({ ...bDocument, name: "B survives" })
    await b.runtime.whenProjectBackendIdle()
    expect(b.store.getState().document.name).toBe("B survives")
    expect(b.requests.at(-1)?.sequence).toBeGreaterThan(bRequests.at(-1)?.sequence ?? -1)
  } finally {
    stopA()
    stopB()
  }
})

it("normalizes missing tracks using each consumer's injected height", async () => {
  for (const height of [72, 144]) {
    const { store, runtime } = consumer(height)
    const stop = runtime.startProjectRuntime()
    const missingTracks = {
      document: {
        ...initialDocument(height),
        tracks: initialDocument(height).tracks.filter(track => track.kind === "main"),
      },
      workspace: initialWorkspace(),
    }
    try {
      runtime.hydrateState(missingTracks)
      expect(store.getState().document.tracks.find(track => track.kind === "audio")?.heightPx).toBe(
        height
      )
      expect(store.getState().document.tracks.find(track => track.kind === "main")?.heightPx).toBe(
        108
      )
      await runtime.replaceProject(missingTracks, new AbortController().signal)
      expect(store.getState().document.tracks.find(track => track.kind === "audio")?.heightPx).toBe(
        height
      )
      runtime.resetProject("new-project")
      expect(store.getState().document.tracks.find(track => track.kind === "audio")?.heightPx).toBe(
        height
      )
      expect(store.getState().document.tracks.find(track => track.kind === "main")?.heightPx).toBe(
        108
      )
    } finally {
      stop()
    }
  }
})

it("imports the package without starting timers or creating runtime instances", async () => {
  vi.resetModules()
  const interval = vi.spyOn(globalThis, "setInterval")
  const timeout = vi.spyOn(globalThis, "setTimeout")
  try {
    // Re-import after installing spies to observe module evaluation, not cached static imports.
    await import("@zoeydaw/project-runtime")
    await import("@zoeydaw/project-runtime/store")
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
  } finally {
    interval.mockRestore()
    timeout.mockRestore()
  }
})

it("does not project documents or touch edit history for transport, MIDI UI state, or note edges", async () => {
  const project = vi.spyOn(projection, "projectBackendDocument")
  const c = consumer(108, createMockDocument(108))
  const release = c.runtime.startProjectRuntime()
  try {
    const document = c.store.getState().document
    const initial = project.mock.calls.length
    const requests = c.requests.length
    for (let i = 0; i < 100; i++) {
      c.runtime.session({ position: { bar: i + 1, beat: 1, sixteenth: 1 } })
    }
    c.runtime.session({ midiVelocity: 64, activeMidiNotes: [60] })
    expect(project).toHaveBeenCalledTimes(initial)
    expect(c.requests).toHaveLength(requests)
    expect(c.controls).toHaveLength(100)
    expect(c.store.getState().document).toBe(document)
    expect(c.store.getState().session.canUndo).toBe(false)
    expect(c.runtime.projectRevision()).toBe(0)
    expect(c.notes).toHaveLength(0)
    const track = document.tracks.find(item => item.kind === "midi")
    if (!track) throw new Error("Fixture needs a MIDI track")
    c.runtime.submitNote({ trackId: track.id, noteId: "edge", pitch: 60, velocity: 64, on: true })
    c.runtime.submitNote({ trackId: track.id, noteId: "edge", pitch: 60, velocity: 0, on: false })
    expect(c.notes.map(request => request.note.on)).toEqual([true, false])
    expect(c.runtime.projectRevision()).toBe(0)
    expect(c.store.getState().session.canUndo).toBe(false)
    expect(await c.runtime.whenProjectBackendIdle()).toBe(true)
  } finally {
    release()
    project.mockRestore()
  }
})

it("reuses one projection for unchanged effective document identity", () => {
  const project = vi.spyOn(projection, "projectBackendDocument")
  const c = consumer(108)
  const release = c.runtime.startProjectRuntime()
  try {
    const initial = project.mock.calls.length
    const token = c.runtime.beginPreview()
    c.runtime.previewMarkers(token, [{ id: "marker", label: "marker", bar: 3 }])
    expect(project).toHaveBeenCalledTimes(initial + 1)
    c.runtime.session({ playing: true })
    c.runtime.session({ playing: false })
    c.runtime.session({ midiVelocity: 33 })
    expect(project).toHaveBeenCalledTimes(initial + 1)
    c.runtime.cancelPreview(token)
    expect(project).toHaveBeenCalledTimes(initial + 2)
    expect(c.store.getState().session.canUndo).toBe(false)
  } finally {
    release()
    project.mockRestore()
  }
})
