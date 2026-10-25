import { createMockDocument } from "../testing"
import { createBackendConnection } from "./connection"
import { projectBackendDocument } from "./projection"
import type {
  BackendFailureCode,
  BackendDocumentRequest,
  BackendControlRequest,
  BackendNoteRequest,
  BackendResult,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
  ProjectRuntimeStatus,
} from "@zoeydaw/project-core/backend"

export function state(seekBar = 1, seekGeneration = 0, playing = false): BackendState {
  return {
    project: projectBackendDocument(createMockDocument(108)),
    control: {
      playing,
      recording: false,
      seekBar,
      seekGeneration,
    },
  }
}

export function deferred<T = BackendResult>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Uninitialized deferred")
  }
  let reject: (reason: Error) => void = () => {
    throw new Error("Uninitialized deferred")
  }
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export function accepted(
  request: BackendDocumentRequest | BackendControlRequest,
  revision = "revision" in request ? request.revision : 0
): BackendResult {
  return {
    kind: "accepted",
    sessionId: request.sessionId,
    sequence: request.sequence,
    revision,
    controlGeneration: request.controlGeneration,
  }
}

export function frame(
  request: BackendDocumentRequest | BackendControlRequest,
  bar = 1
): BackendTelemetry {
  return {
    sessionId: request.sessionId,
    sequence: request.sequence,
    appliedSequence: request.sequence,
    controlGeneration: request.controlGeneration,
    clock: { kind: "musical", bar, barsPerSecond: 0.5 },
    playing: "state" in request ? request.state.control.playing : request.control.playing,
    recording: false,
  }
}

export interface ControlledBackend extends ProjectBackend {
  requests: BackendDocumentRequest[]
  controls: BackendControlRequest[]
  calls: (BackendDocumentRequest | BackendControlRequest)[]
  notes: BackendNoteRequest[]
  listeners: Set<(frame: BackendTelemetry) => void>
  disposed: boolean
  send: (frame: BackendTelemetry) => void
}

export function controlled(
  apply: (request: BackendDocumentRequest) => BackendResult | Promise<BackendResult>,
  control?: (
    request: BackendControlRequest,
    revision: number
  ) => BackendResult | Promise<BackendResult>
): ControlledBackend {
  const requests: BackendDocumentRequest[] = []
  const controls: BackendControlRequest[] = []
  const calls: (BackendDocumentRequest | BackendControlRequest)[] = []
  const notes: BackendNoteRequest[] = []
  let revision = 0
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  const backend: ControlledBackend = {
    requests,
    controls,
    calls,
    notes,
    listeners,
    disposed: false,
    apply(request) {
      requests.push(request)
      calls.push(request)
      if (request.stage === "commit" || request.stage === "recover") revision = request.revision
      return apply(request)
    },
    control(request) {
      controls.push(request)
      calls.push(request)
      return control?.(request, revision) ?? accepted(request, revision)
    },
    note(request) {
      notes.push(request)
      return { kind: "accepted", sessionId: request.sessionId, sequence: request.sequence }
    },
    allNotesOff() {},
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send(value) {
      for (const listener of listeners) {
        listener(value)
      }
    },
    dispose() {
      backend.disposed = true
      listeners.clear()
    },
  }
  return backend
}

export function harness(backend: ControlledBackend) {
  const acceptedRequests: BackendDocumentRequest[] = []
  const rejectedRequests: { request: BackendDocumentRequest; code: BackendFailureCode }[] = []
  const acceptedControls: BackendControlRequest[] = []
  const rejectedControls: { request: BackendControlRequest; code: BackendFailureCode }[] = []
  const rejectedNotes: (BackendFailureCode | "note-overrun")[] = []
  const statuses: ProjectRuntimeStatus[] = []
  const frames: BackendTelemetry[] = []
  const connection = createBackendConnection({
    factory: () => backend,
    onAccepted: request => {
      acceptedRequests.push(request)
    },
    onRejected: (request, code) => {
      rejectedRequests.push({ request, code })
    },
    onControlAccepted: request => {
      acceptedControls.push(request)
    },
    onControlRejected: (request, code) => {
      rejectedControls.push({ request, code })
    },
    onNoteRejected: code => {
      rejectedNotes.push(code)
    },
    onStatus: status => {
      statuses.push(status)
    },
    onTelemetry: value => {
      frames.push(value)
    },
  })
  return {
    connection,
    acceptedRequests,
    rejectedRequests,
    acceptedControls,
    rejectedControls,
    rejectedNotes,
    statuses,
    frames,
  }
}
