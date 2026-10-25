import type {
  BackendControlRequest,
  BackendDocumentRequest,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendTelemetry,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"

export function deferredBackend({ deferNotes = false } = {}) {
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
