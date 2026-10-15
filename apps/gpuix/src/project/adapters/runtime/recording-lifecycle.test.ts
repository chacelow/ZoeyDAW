import { expect, it } from "bun:test"
import { createStore } from "zustand/vanilla"
import { initialDocument } from "@/project/stores/slices/document"
import { initialWorkspace } from "@/project/stores/slices/workspace"
import { initialSession } from "@/project/stores/slices/session"
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
      document: initialDocument(),
      workspace: initialWorkspace(),
      session: initialSession(),
    }))
    const runtime = createProjectRuntime({ store, backendFactory: createMockProjectBackend })
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
