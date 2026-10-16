import { expect, it } from "bun:test"
import { createStore } from "zustand/vanilla"
import {
  createTestDocument,
  createTestWorkspace,
  createTestSession,
  TEST_PROJECT_CREATION,
} from "../fixtures"
import { createMockProjectBackend } from "../backend/mock"
import { createProjectRuntime } from "."
import type { BackendRequest, ProjectBackend } from "@/project/model/backend"
import type { ProjectState } from "@/project/model/types"

it.each([
  { owner: "edit", lifecycle: "release" },
  { owner: "preview", lifecycle: "release" },
  { owner: "edit", lifecycle: "replace" },
  { owner: "preview", lifecycle: "replace" },
  { owner: "edit", lifecycle: "unregister" },
  { owner: "preview", lifecycle: "unregister" },
])(
  "retains recording during $owner teardown at $lifecycle despite synchronous rejection",
  ({ owner, lifecycle }) => {
    const requests: BackendRequest[] = []
    const backend: ProjectBackend = {
      apply(request) {
        requests.push(request)
        return request.stage === "open" || request.stage === "preview"
          ? {
              kind: "accepted",
              sessionId: request.sessionId,
              sequence: request.sequence,
              revision: request.revision,
            }
          : {
              kind: "rejected",
              sessionId: request.sessionId,
              sequence: request.sequence,
              code: "rejected",
            }
      },
      subscribe: () => () => {},
      readPeaks: () => new Float32Array(0),
      dispose() {},
    }
    const store = createStore<ProjectState>(() => ({
      document: createTestDocument(),
      workspace: createTestWorkspace(),
      session: createTestSession(),
    }))
    const runtime = createProjectRuntime({
      store,
      backendFactory: createMockProjectBackend,
      creation: TEST_PROJECT_CREATION,
    })
    const unregister = runtime.configureProjectBackend(() => backend)
    const release = runtime.startProjectRuntime()
    if (owner === "edit") {
      runtime.beginEdit("teardown-recording")
      runtime.document({ ...runtime.get().document, name: "Uncommitted" })
    } else {
      const token = runtime.beginPreview()
      runtime.previewMarkers(token, [{ id: "preview", label: "Temporary", bar: 2 }])
    }
    runtime.recordDocument(document => ({
      ...document,
      markers: [...document.markers, { id: "recorded", label: "Recorded", bar: 4 }],
    }))
    let removeReplacement = () => {}
    if (lifecycle === "release") {
      release()
    } else if (lifecycle === "replace") {
      removeReplacement = runtime.configureProjectBackend(createMockProjectBackend)
    } else {
      unregister()
    }
    expect(runtime.get().document.markers.map(marker => marker.id)).toEqual(["recorded"])
    expect(runtime.get().document.name).not.toBe("Uncommitted")
    expect(requests.map(request => request.stage)).toEqual(["open", "preview"])
    const reopened = lifecycle === "release" ? runtime.startProjectRuntime() : release
    expect(runtime.get().document.markers.map(marker => marker.id)).toEqual(["recorded"])
    reopened()
    removeReplacement()
    unregister()
  }
)

it("retains submitted recording after commit and recovery reject across reopen", async () => {
  const requests: BackendRequest[] = []
  const backend: ProjectBackend = {
    apply(request) {
      requests.push(request)
      return request.stage === "open"
        ? {
            kind: "accepted",
            sessionId: request.sessionId,
            sequence: request.sequence,
            revision: request.revision,
          }
        : {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            code: "rejected",
          }
    },
    subscribe: () => () => {},
    readPeaks: () => new Float32Array(0),
    dispose() {},
  }
  const store = createStore<ProjectState>(() => ({
    document: createTestDocument(),
    workspace: createTestWorkspace(),
    session: createTestSession(),
  }))
  const runtime = createProjectRuntime({
    store,
    backendFactory: () => backend,
    creation: TEST_PROJECT_CREATION,
  })
  const release = runtime.startProjectRuntime()
  runtime.recordDocument(document => ({
    ...document,
    markers: [...document.markers, { id: "recorded", label: "Recorded", bar: 4 }],
  }))
  expect(await runtime.whenProjectBackendIdle()).toBe(false)
  expect(requests.map(request => request.stage)).toEqual(["open", "commit", "recover"])
  expect(runtime.get().document.markers.map(marker => marker.id)).toEqual(["recorded"])
  expect(runtime.get().session.dirty).toBe(true)
  release()
  const reopened = runtime.startProjectRuntime()
  expect(runtime.get().document.markers.map(marker => marker.id)).toEqual(["recorded"])
  reopened()
})
