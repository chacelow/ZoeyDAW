import { afterEach, describe, expect, it, vi } from "vitest"
import { createBackendConnection } from "./connection"
import type {
  BackendFailureCode,
  BackendTelemetry,
  ProjectRuntimeStatus,
} from "@zoeydaw/project-core/backend"
import { state, deferred, accepted, frame, controlled, harness } from "./connection.testing"

afterEach(() => vi.useRealTimers())

describe("backend connection", () => {
  it("acknowledges synchronous mock-style applications before returning and disposes leases", async () => {
    const backend = controlled(accepted)
    const h = harness(backend)
    h.connection.open("one", state())
    expect(h.acceptedRequests.map(request => request.stage)).toEqual(["open"])
    expect(h.statuses.at(-1)).toMatchObject({ phase: "ready", acceptedRevision: 0 })
    const sequence = h.connection.submit({
      stage: "commit",
      revision: 1,
      editId: "e",
      state: state(3, 1),
    })
    expect(sequence).toBe(1)
    expect(h.acceptedRequests.map(request => request.stage)).toEqual(["open", "commit"])
    expect(h.statuses.at(-1)).toMatchObject({ acceptedRevision: 1, pending: 0 })
    const stop = h.connection.start()
    expect(backend.listeners.size).toBe(1)
    backend.send(frame(backend.requests[1], 3))
    expect(h.connection.readTelemetry()?.clock.bar).toBe(3)
    stop()
    expect(backend.listeners.size).toBe(0)
    expect(h.connection.readTelemetry()).toBeNull()
    expect(await h.connection.whenIdle()).toBe(true)
    h.connection.dispose()
    expect(backend.disposed).toBe(true)
  })

  it("settles an async acknowledgement in the first fulfillment or rejection microtask", async () => {
    const waiting = deferred()
    const backend = controlled(request =>
      request.stage === "open" ? waiting.promise : accepted(request)
    )
    const h = harness(backend)
    h.connection.open("one", state())
    waiting.resolve(accepted(backend.requests[0]))
    await Promise.resolve()
    expect(h.acceptedRequests).toHaveLength(1)
    expect(h.statuses.at(-1)?.phase).toBe("ready")
    h.connection.dispose()

    const rejected = deferred()
    const offline = controlled(request =>
      request.stage === "open" ? rejected.promise : accepted(request)
    )
    const failed = harness(offline)
    failed.connection.open("two", state())
    rejected.reject(new Error("offline"))
    await Promise.resolve()
    expect(failed.rejectedRequests.map(value => value.code)).toEqual(["connection"])
    expect(failed.statuses.at(-1)?.phase).toBe("error")
    failed.connection.dispose()
  })

  it("does not allow old session promise or listener to alter a reopened connection", async () => {
    const waiting = deferred()
    const first = controlled(request =>
      request.stage === "open" ? waiting.promise : accepted(request)
    )
    const second = controlled(accepted)
    const statuses: ProjectRuntimeStatus[] = []
    const frames: BackendTelemetry[] = []
    let factoryCalls = 0
    const connection = createBackendConnection({
      factory: () => (++factoryCalls === 1 ? first : second),
      onAccepted: () => {},
      onRejected: () => {},
      onStatus: value => {
        statuses.push(value)
      },
      onTelemetry: value => {
        frames.push(value)
      },
    })
    connection.open("old", state())
    const stop = connection.start()
    const lateListener = first.listeners.values().next().value
    connection.open("new", state())
    expect(first.disposed).toBe(true)
    waiting.resolve(accepted(first.requests[0]))
    await Promise.resolve()
    lateListener?.(frame(first.requests[0], 99))
    second.send(frame(second.requests[0], 4))
    expect(statuses.at(-1)).toMatchObject({ sessionId: "new", phase: "ready" })
    expect(frames.map(value => value.clock.bar)).toEqual([4])
    stop()
    connection.dispose()
  })

  it("treats malformed results as protocol failures without accepting their state", async () => {
    const bad = controlled(request =>
      request.stage === "commit"
        ? {
            kind: "accepted",
            sessionId: "other",
            sequence: request.sequence,
            revision: request.revision,
            controlGeneration: request.controlGeneration,
          }
        : accepted(request)
    )
    const h = harness(bad)
    h.connection.open("one", state())
    h.connection.submit({ stage: "commit", revision: 1, editId: "bad", state: state(4) })
    expect(h.rejectedRequests.map(value => value.code)).toEqual(["protocol"])
    expect(h.statuses.at(-1)?.acceptedRevision).toBe(0)
    expect(await h.connection.whenIdle()).toBe(false)
    h.connection.dispose()
  })
})

it("puts pre-open control in open and holds subsequent control and note edges behind its acknowledgement", async () => {
  const opening = deferred()
  const backend = controlled(request =>
    request.stage === "open" ? opening.promise : accepted(request)
  )
  const h = harness(backend)
  h.connection.submitControl(state(7, 1, true).control)
  h.connection.open("opening", state())
  expect(backend.requests[0].state.control.seekBar).toBe(7)
  h.connection.submitControl(state(8, 2, true).control)
  h.connection.submitControl(state(9, 3, true).control)
  h.connection.submitNote({ trackId: "midi", noteId: "short", pitch: 60, velocity: 100, on: true })
  h.connection.submitNote({ trackId: "midi", noteId: "short", pitch: 60, velocity: 0, on: false })
  expect(backend.controls).toHaveLength(0)
  expect(backend.notes).toHaveLength(0)
  opening.resolve(accepted(backend.requests[0]))
  expect(await h.connection.whenIdle()).toBe(true)
  expect(backend.controls[0].control.seekBar).toBe(9)
  expect(backend.notes.map(request => [request.sequence, request.note.on])).toEqual([
    [1, true],
    [2, false],
  ])
  expect(backend.calls.map(request => request.sequence)).toEqual([0, 1])
  h.connection.dispose()
})

it("readmits only a locally superseded opening with the next sequence and preserves queued commits and idle waiters", async () => {
  const admission = deferred()
  const backend = controlled(request =>
    request.sequence === 0 ? admission.promise : accepted(request)
  )
  backend.urgentStop = vi.fn(async () => {})
  const h = harness(backend)
  const opening = state(1, 0, true)
  opening.project.bpm = 120
  h.connection.open("admission", opening)
  const changed = state(1, 0, true)
  changed.project.bpm = 90
  h.connection.submit({ stage: "commit", revision: 1, editId: "queued", state: changed })
  h.connection.submitControl(state(1, 0, false).control)
  const idle = h.connection.whenIdle()
  const canceled = backend.requests[0]
  admission.resolve({
    kind: "rejected",
    sessionId: canceled.sessionId,
    sequence: canceled.sequence,
    controlGeneration: canceled.controlGeneration,
    code: "superseded-open",
  })
  expect(await idle).toBe(true)
  expect(backend.requests.map(request => [request.stage, request.sequence])).toEqual([
    ["open", 0],
    ["open", 1],
    ["commit", 2],
  ])
  expect(backend.requests[1]).toMatchObject({
    sessionId: "admission",
    revision: 0,
    baseRevision: 0,
    controlGeneration: "1",
    state: { project: { bpm: 120 }, control: { playing: false } },
  })
  expect(backend.requests[2]).toMatchObject({
    revision: 1,
    baseRevision: 0,
    editId: "queued",
    state: { project: { bpm: 90 }, control: { playing: false } },
  })
  expect(h.rejectedRequests).toEqual([])
  expect(h.acceptedRequests.map(request => request.sequence)).toEqual([1, 2])
  expect(h.statuses.at(-1)).toMatchObject({ phase: "ready", acceptedRevision: 1, error: null })
  expect(backend.disposed).toBe(false)
  h.connection.submitControl(state(1, 0, true).control)
  expect(await h.connection.whenIdle()).toBe(true)
  expect(backend.controls[0]).toMatchObject({ sequence: 3, control: { playing: true } })
  expect(h.statuses.at(-1)).toMatchObject({ acceptedRevision: 1, error: null })
  h.connection.dispose()
})

it.each(["rejected", "connection", "protocol", "disposed"] satisfies BackendFailureCode[])(
  "does not retry arbitrary opening failure %s even when Stop advanced the generation",
  async code => {
    const admission = deferred()
    const backend = controlled(() => admission.promise)
    backend.urgentStop = vi.fn(async () => {})
    const h = harness(backend)
    h.connection.open("failed-admission", state(1, 0, true))
    h.connection.submitControl(state().control)
    const request = backend.requests[0]
    admission.resolve({
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      controlGeneration: request.controlGeneration,
      code,
    })
    expect(await h.connection.whenIdle()).toBe(false)
    expect(backend.requests).toHaveLength(1)
    expect(h.rejectedRequests.map(value => value.code)).toEqual([code])
    h.connection.dispose()
  }
)

it("rejects superseded-open without a newer control generation instead of looping", async () => {
  const backend = controlled(request => ({
    kind: "rejected",
    sessionId: request.sessionId,
    sequence: request.sequence,
    controlGeneration: request.controlGeneration,
    code: "superseded-open",
  }))
  const h = harness(backend)
  h.connection.open("bad-cancel", state())
  expect(await h.connection.whenIdle()).toBe(false)
  expect(backend.requests).toHaveLength(1)
  expect(h.rejectedRequests.map(value => value.code)).toEqual(["protocol"])
  h.connection.dispose()
})

it("treats superseded-open on an established control request as a protocol fault", async () => {
  const backend = controlled(accepted, request => ({
    kind: "rejected",
    sessionId: request.sessionId,
    sequence: request.sequence,
    controlGeneration: request.controlGeneration,
    code: "superseded-open",
  }))
  const h = harness(backend)
  h.connection.open("bad-control-cancel", state())
  h.connection.submitControl(state(2, 1, true).control)
  expect(await h.connection.whenIdle()).toBe(false)
  expect(backend.requests).toHaveLength(1)
  expect(h.rejectedControls.map(value => value.code)).toEqual(["protocol"])
  h.connection.dispose()
})
