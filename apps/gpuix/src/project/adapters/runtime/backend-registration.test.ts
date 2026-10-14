import { expect, it } from "bun:test"
import { createStore } from "zustand/vanilla"
import { initialDocument } from "../../stores/slices/document"
import { initialWorkspace } from "../../stores/slices/workspace"
import { initialSession } from "../../stores/slices/session"
import { createMockProjectBackend } from "../backend/mock"
import { createProjectRuntime, ProjectBackendNotConfiguredError } from "."
import type { ProjectState } from "../../model/types"

function isolatedRuntime() {
  const store = createStore<ProjectState>(() => ({
    document: initialDocument(),
    workspace: initialWorkspace(),
    session: initialSession(),
  }))
  const runtime = createProjectRuntime({ store })
  runtime.resetProject("backend-registration")
  return runtime
}

it("rejects runtime acquisition without a backend while preserving idle editing and undo", () => {
  const runtime = isolatedRuntime()
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 155 },
  })
  expect(runtime.get().document.transport.bpm).toBe(155)
  expect(() => runtime.startProjectRuntime()).toThrow(ProjectBackendNotConfiguredError)
  expect(runtime.get().session.backend.phase).toBe("idle")
  expect(runtime.get().document.transport.bpm).toBe(155)
  runtime.undo()
  expect(runtime.get().document.transport.bpm).toBe(120)
})

it("opens only the explicitly registered backend and returns to idle when it is removed", () => {
  const runtime = isolatedRuntime()
  const remove = runtime.configureProjectBackend(createMockProjectBackend)
  const release = runtime.startProjectRuntime()
  try {
    expect(runtime.get().session.backend.phase).toBe("ready")
    runtime.document({
      ...runtime.get().document,
      transport: { ...runtime.get().document.transport, bpm: 155 },
    })
    expect(runtime.get().session.backend.acceptedRevision).toBe(1)
    remove()
    expect(runtime.get().session.backend.phase).toBe("idle")
    expect(runtime.get().document.transport.bpm).toBe(155)
    expect(() => runtime.startProjectRuntime()).toThrow(ProjectBackendNotConfiguredError)
  } finally {
    release()
    remove()
  }
})
