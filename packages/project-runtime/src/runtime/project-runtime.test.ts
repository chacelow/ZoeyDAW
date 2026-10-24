import { afterEach, expect, it, vi } from "vitest"
import { createProjectStore } from "../store"
import { initialWorkspace } from "../state/workspace"
import { createMockDocument } from "../testing/fixtures"
import { createMockProjectBackend } from "../testing/mock"
import { createProjectRuntime } from "./project-runtime"
import type {
  BackendDocumentRequest,
  BackendResult,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"
import type { DocumentState } from "@zoeydaw/project-core/types"

const releases: (() => void)[] = []

afterEach(() => {
  for (const release of releases.splice(0)) release()
})

function harness({ synchronous = false, deferOpen = false } = {}) {
  const requests: BackendDocumentRequest[] = []
  const pending: {
    request: BackendDocumentRequest
    resolve: (result: BackendResult | PromiseLike<BackendResult>) => void
  }[] = []
  const delegate = createMockProjectBackend()
  const backend: ProjectBackend = {
    ...delegate,
    apply(request) {
      requests.push(request)
      if (synchronous || (request.stage === "open" && !deferOpen)) {
        return delegate.apply(request)
      }
      return new Promise<BackendResult>(resolve => {
        pending.push({ request, resolve })
      })
    },
  }
  const store = createProjectStore({
    document: createMockDocument(108),
    workspace: initialWorkspace(),
  })
  const runtime = createProjectRuntime({
    store,
    backendFactory: () => backend,
    defaultTrackHeight: 108,
  })
  const release = runtime.startProjectRuntime()
  releases.push(release)
  async function settle(kind: "accepted" | "rejected" = "accepted") {
    const next = pending.shift()
    if (!next) throw new Error("No backend request awaits settlement")
    if (kind === "accepted") next.resolve(delegate.apply(next.request))
    else {
      next.resolve({
        kind,
        sessionId: next.request.sessionId,
        sequence: next.request.sequence,
        controlGeneration: next.request.controlGeneration,
        code: "rejected",
      })
    }
    await Promise.resolve()
    return next.request
  }
  return { runtime, requests, pending, release, settle }
}

function appendRecording(id = "recorded-1", targetId = "3-audio") {
  return (document: DocumentState): DocumentState => {
    const target = document.tracks.find(track => track.id === targetId)
    if (!target) throw new Error("Recording target disappeared")
    if (target.clips.some(clip => clip.id === id)) return document
    const original = target.clips.find(clip => clip.kind === "audio")
    if (!original || original.kind !== "audio") throw new Error("Recording fixture needs audio")
    const clip = { ...original, id, startBar: 20, lengthBars: 1 }
    return {
      ...document,
      tracks: document.tracks.map(track =>
        track.id === targetId ? { ...track, clips: [...track.clips, clip] } : track
      ),
    }
  }
}

function recordedIds(document: DocumentState): string[] {
  return document.tracks.flatMap(track =>
    track.clips.filter(clip => clip.id.startsWith("recorded-")).map(clip => clip.id)
  )
}

function watch(promise: Promise<unknown>) {
  let settled = false
  void promise
    .then(() => {
      settled = true
    })
    .catch(() => {
      settled = true
    })
  return () => settled
}

it("binds a recording receipt before a synchronous backend acknowledgement", async () => {
  const { runtime, requests } = harness({ synchronous: true })
  const receipt = await runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  expect(receipt).toEqual({ sessionId: requests[1].sessionId, revision: requests[1].revision })
  expect(receipt.revision).toBe(1)
  expect(runtime.get().session.backend.acceptedRevision).toBe(1)
})

it("waits for the recording's acknowledgement rather than optimistic state or queue admission", async () => {
  const { runtime, requests, settle } = harness()
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const settled = watch(promise)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
  await Promise.resolve()
  expect(settled()).toBe(false)
  const request = requests[1]
  expect(request.state.project.tracks.flatMap(track => track.clips).map(clip => clip.id)).toContain(
    "recorded-1"
  )
  await settle()
  await expect(promise).resolves.toEqual({
    sessionId: request.sessionId,
    revision: request.revision,
  })
})

it("journals through an asynchronous edit and binds the later actual submitted revision", async () => {
  const { runtime, requests, settle } = harness()
  const token = runtime.beginEdit("delayed-control")
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 140 },
  })
  const apply = vi.fn(appendRecording())
  const promise = runtime.recordDocumentConfirmed(apply, runtime.projectEpoch())
  const settled = watch(promise)
  await Promise.resolve()
  expect(apply).not.toHaveBeenCalled()
  expect(recordedIds(runtime.get().document)).toEqual([])
  runtime.endEdit(token)
  expect(apply).toHaveBeenCalledTimes(1)
  expect(runtime.projectRevision()).toBe(2)
  await settle()
  expect(requests.at(-1)?.stage).toBe("commit")
  expect(settled()).toBe(false)
  await settle()
  const recordingRequest = requests.at(-1)
  expect(recordingRequest?.revision).toBe(2)
  expect(settled()).toBe(false)
  await settle()
  await expect(promise).resolves.toEqual({
    sessionId: recordingRequest?.sessionId,
    revision: recordingRequest?.revision,
  })
})

it("retains a confirmed journal entry through preview cancellation without confirming the cancel", async () => {
  const { runtime, settle } = harness()
  const token = runtime.beginPreview()
  runtime.previewTracks(
    token,
    runtime.get().document.tracks.map(track => ({ ...track, name: "Preview" }))
  )
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const settled = watch(promise)
  runtime.cancelPreview(token)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
  await settle()
  expect(settled()).toBe(false)
  await settle()
  expect(settled()).toBe(false)
  const request = await settle()
  await expect(promise).resolves.toEqual({
    sessionId: request.sessionId,
    revision: request.revision,
  })
})

it("does not confirm on open when a recording commit still awaits acknowledgement", async () => {
  const { runtime, settle } = harness({ deferOpen: true })
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const settled = watch(promise)
  const opening = await settle()
  expect(opening.stage).toBe("open")
  expect(settled()).toBe(false)
  const recording = await settle()
  await expect(promise).resolves.toEqual({
    sessionId: recording.sessionId,
    revision: recording.revision,
  })
})

it("keeps repeated stable recordings idempotent before and after acceptance", async () => {
  const { runtime, requests, settle } = harness()
  const epoch = runtime.projectEpoch()
  const first = runtime.recordDocumentConfirmed(appendRecording(), epoch)
  const second = runtime.recordDocumentConfirmed(appendRecording(), epoch)
  const secondSettled = watch(second)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
  const firstRequest = await settle()
  await expect(first).resolves.toEqual({
    sessionId: firstRequest.sessionId,
    revision: firstRequest.revision,
  })
  expect(secondSettled()).toBe(false)
  const secondRequest = await settle()
  await expect(second).resolves.toEqual({
    sessionId: secondRequest.sessionId,
    revision: secondRequest.revision,
  })
  const requestCount = requests.length
  await expect(runtime.recordDocumentConfirmed(appendRecording(), epoch)).resolves.toEqual({
    sessionId: secondRequest.sessionId,
    revision: secondRequest.revision,
  })
  expect(requests).toHaveLength(requestCount)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
  runtime.undo()
  expect(recordedIds(runtime.get().document)).toEqual([])
})

it("preserves receipts for dropped queued recordings and resolves the accepted recovery revision", async () => {
  const { runtime, requests, settle } = harness()
  runtime.document({
    ...runtime.get().document,
    transport: { ...runtime.get().document.transport, bpm: 140 },
  })
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const settled = watch(promise)
  expect(runtime.projectRevision()).toBe(2)
  await settle("rejected")
  const recovery = requests.at(-1)
  expect(recovery?.stage).toBe("recover")
  expect(recovery?.revision).toBe(3)
  expect(recovery?.state.project.bpm).toBe(120)
  expect(
    recovery?.state.project.tracks.flatMap(track => track.clips).map(clip => clip.id)
  ).toContain("recorded-1")
  expect(settled()).toBe(false)
  await settle()
  await expect(promise).resolves.toEqual({
    sessionId: recovery?.sessionId,
    revision: recovery?.revision,
  })
  expect(runtime.get().document.transport.bpm).toBe(120)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})

it("keeps a rejected recording receipt deferred until its recovery is accepted", async () => {
  const { runtime, requests, settle } = harness()
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const settled = watch(promise)
  await settle("rejected")
  const recovery = requests.at(-1)
  expect(recovery?.stage).toBe("recover")
  expect(settled()).toBe(false)
  await settle()
  await expect(promise).resolves.toEqual({
    sessionId: recovery?.sessionId,
    revision: recovery?.revision,
  })
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})

it("rejects pending and journal receipts if backend recovery is rejected", async () => {
  const { runtime, settle } = harness()
  const first = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const firstFailure = expect(first).rejects.toThrow("rejected recording recovery")
  runtime.beginEdit("journal")
  const second = runtime.recordDocumentConfirmed(
    appendRecording("recorded-2"),
    runtime.projectEpoch()
  )
  const secondFailure = expect(second).rejects.toThrow("rejected recording recovery")
  await settle("rejected")
  await settle("rejected")
  await firstFailure
  await secondFailure
  await expect(
    runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  ).rejects.toThrow("unavailable")
})

it("rejects pending receipts on final release and ignores late acknowledgements", async () => {
  const { runtime, release, settle } = harness()
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const failure = expect(promise).rejects.toThrow("disposed")
  release()
  await failure
  await settle()
  expect(runtime.get().session.backend.phase).toBe("idle")
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})

it("rejects a journal receipt on disposal while preserving independent authored recording", async () => {
  const { runtime, release } = harness({ synchronous: true })
  runtime.beginEdit("temporary")
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const failure = expect(promise).rejects.toThrow("disposed")
  release()
  await failure
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})

it("rejects journal receipts before backend replacement can synchronously flush them", async () => {
  const { runtime } = harness({ synchronous: true })
  runtime.beginEdit("temporary")
  const promise = runtime.recordDocumentConfirmed(appendRecording(), runtime.projectEpoch())
  const failure = expect(promise).rejects.toThrow("backend changed")
  const restore = runtime.configureProjectBackend(createMockProjectBackend)
  releases.push(restore)
  await failure
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})

it("rejects a stale project epoch before calling the recording reducer", async () => {
  const { runtime, requests } = harness()
  const apply = vi.fn(appendRecording())
  const before = runtime.get().document
  await expect(runtime.recordDocumentConfirmed(apply, "stale-epoch")).rejects.toThrow(
    "Project changed"
  )
  expect(apply).not.toHaveBeenCalled()
  expect(runtime.get().document).toBe(before)
  expect(requests).toHaveLength(1)
})

it("rejects a deferred receipt when hydration replaces its project", async () => {
  const { runtime } = harness()
  runtime.beginEdit("temporary")
  const apply = vi.fn(appendRecording())
  const promise = runtime.recordDocumentConfirmed(apply, runtime.projectEpoch())
  const failure = expect(promise).rejects.toThrow("Project changed")
  runtime.hydrateState({ document: createMockDocument(108), workspace: initialWorkspace() }, false)
  await failure
  expect(apply).not.toHaveBeenCalled()
  expect(recordedIds(runtime.get().document)).toEqual([])
})

it("rejects reducer errors without accepting a revision or changing history", async () => {
  const { runtime, requests } = harness()
  const before = runtime.get().document
  const error = new Error("Cannot publish missing recording target")
  await expect(
    runtime.recordDocumentConfirmed(() => {
      throw error
    }, runtime.projectEpoch())
  ).rejects.toBe(error)
  expect(runtime.get().document).toBe(before)
  expect(runtime.get().session.canUndo).toBe(false)
  expect(requests).toHaveLength(1)
})

it("rejects deferred reducer errors rather than throwing out of gesture completion", async () => {
  const { runtime, requests } = harness()
  const token = runtime.beginEdit("temporary")
  const error = new Error("Deferred recording reducer failed")
  const promise = runtime.recordDocumentConfirmed(() => {
    throw error
  }, runtime.projectEpoch())
  const failure = expect(promise).rejects.toBe(error)
  expect(() => runtime.endEdit(token)).not.toThrow()
  await failure
  expect(requests).toHaveLength(1)
})

it("rejects a receipt if its target is missing when independent recording is recovered", async () => {
  const { runtime, settle } = harness()
  runtime.document({
    ...runtime.get().document,
    tracks: runtime
      .get()
      .document.tracks.map(track =>
        track.id === "3-audio" ? { ...track, id: "temporary-target" } : track
      ),
  })
  const promise = runtime.recordDocumentConfirmed(
    appendRecording("recorded-1", "temporary-target"),
    runtime.projectEpoch()
  )
  const failure = expect(promise).rejects.toThrow("Recording target disappeared")
  await settle("rejected")
  await failure
  await settle()
  expect(recordedIds(runtime.get().document)).toEqual([])
  expect(runtime.canSaveProject()).toBe(true)
})

it("rejects invalid recording documents instead of confirming a silently discarded edit", async () => {
  const { runtime, requests } = harness()
  await expect(
    runtime.recordDocumentConfirmed(
      document => ({ ...document, tracks: [] }),
      runtime.projectEpoch()
    )
  ).rejects.toThrow("ordinary track")
  expect(requests).toHaveLength(1)
})

it("preserves the void recording API for existing MIDI consumers", async () => {
  const { runtime, settle } = harness()
  const token = runtime.beginEdit("temporary")
  expect(runtime.recordDocument(appendRecording())).toBeUndefined()
  runtime.cancelEdit(token)
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
  await settle("rejected")
  await settle()
  expect(recordedIds(runtime.get().document)).toEqual(["recorded-1"])
})
