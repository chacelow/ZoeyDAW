import { afterEach, describe, expect, it, vi } from "vitest"
import { createMockDocument } from "../testing/fixtures"
import { createBackendConnection } from "./connection"
import { projectBackendDocument } from "./projection"
import { controlGenerationValue } from "./connection/protocol"
import type {
  BackendFailureCode,
  BackendDocumentRequest,
  BackendControlRequest,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
  ProjectRuntimeStatus,
} from "@zoeydaw/project-core/backend"

function state(seekBar = 1, seekGeneration = 0, playing = false): BackendState {
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
function deferred<T = BackendResult>() {
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
function accepted(
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
function frame(request: BackendDocumentRequest | BackendControlRequest, bar = 1): BackendTelemetry {
  return {
    sessionId: request.sessionId,
    sequence: request.sequence,
    appliedSequence: request.sequence,
    controlGeneration: request.controlGeneration,
    clock: { kind: "musical", bar, barsPerSecond: 0.5 },
    playing: "state" in request ? request.state.control.playing : request.control.playing,
    recording: false,
    levels: { main: [-12, -12] },
  }
}

interface ControlledBackend extends ProjectBackend {
  requests: BackendDocumentRequest[]
  controls: BackendControlRequest[]
  calls: (BackendDocumentRequest | BackendControlRequest)[]
  notes: BackendNoteRequest[]
  listeners: Set<(frame: BackendTelemetry) => void>
  disposed: boolean
  send: (frame: BackendTelemetry) => void
}
function controlled(
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
function harness(backend: ControlledBackend) {
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

afterEach(() => vi.useRealTimers())

it("keeps a newer Play from being rolled back by a document queued before it", async () => {
  const pending = deferred()
  const backend = controlled(request =>
    request.stage === "open" ? accepted(request) : pending.promise
  )
  const h = harness(backend)
  h.connection.open("stale-document", state(1, 0, false))
  // A document queued while stopped, then Play before that document settles.
  h.connection.submit({
    stage: "commit",
    revision: 1,
    editId: "stopped",
    state: state(1, 0, false),
  })
  h.connection.submitControl(state(1, 0, true).control)
  const slow = backend.requests.at(-1)
  if (!slow) throw new Error("Missing queued document")
  pending.resolve(accepted(slow))
  await Promise.resolve()
  // The document carried playing:false; the later Play must survive it.
  expect(h.acceptedRequests.at(-1)?.state.control.playing).toBe(true)
  h.connection.dispose()
})

it("interrupts audible playback while an earlier apply is still pending without reordering the final state", async () => {
  const pending = deferred()
  const backend = controlled(request =>
    request.stage === "open" ? accepted(request) : pending.promise
  )
  const stop = vi.fn(async () => {})
  backend.urgentStop = stop
  const { connection } = harness(backend)
  connection.open("native-stop", state(1, 0, true))
  connection.submit({ stage: "preview", revision: 0, editId: "slow", state: state(9, 1, true) })
  connection.submitControl(state(9, 1, false).control)
  expect(stop).toHaveBeenCalledOnce()
  expect(backend.requests.map(request => request.state.control.playing)).toEqual([true, true])
  const slow = backend.requests[1]
  pending.resolve(accepted(slow))
  await Promise.resolve()
  expect(backend.controls[0].control.playing).toBe(false)
  connection.dispose()
})

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

  it("serializes async commits, coalesces unsent previews, and places cancel after an in-flight preview", async () => {
    const waiting = deferred()
    const backend = controlled(request =>
      request.sequence === 1 ? waiting.promise : accepted(request)
    )
    const h = harness(backend)
    h.connection.open("one", state())
    h.connection.submit({ stage: "preview", revision: 0, editId: "drag", state: state(2) })
    h.connection.submit({ stage: "preview", revision: 0, editId: "drag", state: state(3) })
    h.connection.submit({ stage: "preview", revision: 0, editId: "drag", state: state(4) })
    h.connection.submit({ stage: "cancel", revision: 0, editId: "drag", state: state() })
    h.connection.submit({ stage: "commit", revision: 1, editId: "commit", state: state(8) })
    expect(backend.requests.map(request => request.stage)).toEqual(["open", "preview"])
    waiting.resolve(accepted(backend.requests[1]))
    expect(await h.connection.whenIdle()).toBe(true)
    expect(backend.requests.map(request => request.stage)).toEqual([
      "open",
      "preview",
      "cancel",
      "commit",
    ])
    expect(backend.requests.map(request => request.sequence)).toEqual([0, 1, 2, 3])
    expect(backend.requests.map(request => request.baseRevision)).toEqual([0, 0, 0, 0])
    expect(h.statuses.at(-1)?.acceptedRevision).toBe(1)
    h.connection.dispose()
  })

  it("coalesces only same-edit previews and preserves dispatch order across edits", async () => {
    const waiting = deferred()
    const backend = controlled(request =>
      request.sequence === 1 ? waiting.promise : accepted(request)
    )
    const h = harness(backend)
    h.connection.open("one", state())
    h.connection.submit({ stage: "commit", revision: 1, editId: "first", state: state(2) })
    h.connection.submit({ stage: "preview", revision: 1, editId: "a", state: state(3) })
    h.connection.submit({ stage: "preview", revision: 1, editId: "b", state: state(4) })
    h.connection.submit({ stage: "preview", revision: 1, editId: "a", state: state(5) })
    waiting.resolve(accepted(backend.requests[1]))
    expect(await h.connection.whenIdle()).toBe(true)
    expect(backend.requests.map(request => request.editId)).toEqual([null, "first", "b", "a"])
    expect(backend.requests.slice(2).map(request => request.baseRevision)).toEqual([1, 1])
    expect(backend.requests.slice(2).map(request => request.revision)).toEqual([1, 1])
    h.connection.dispose()
  })

  it("rejects dependent pending edits once, retains error through recovery, and fences old frames", async () => {
    const waiting = deferred()
    const backend = controlled(request =>
      request.sequence === 1 ? waiting.promise : accepted(request)
    )
    const h = harness(backend)
    h.connection.open("one", state())
    const stop = h.connection.start()
    backend.send(frame(backend.requests[0]))
    h.connection.submit({ stage: "commit", revision: 1, editId: "bad", state: state(8, 1, true) })
    h.connection.submit({
      stage: "commit",
      revision: 2,
      editId: "dependent",
      state: state(9, 2, true),
    })
    expect(h.connection.readTelemetry()).toBeNull()
    backend.send(frame(backend.requests[0]))
    expect(h.frames).toHaveLength(1)
    waiting.reject(new Error("device offline"))
    expect(await h.connection.whenIdle()).toBe(false)
    expect(h.rejectedRequests.map(value => value.code)).toEqual(["connection"])
    expect(backend.requests).toHaveLength(2)
    h.connection.submit({ stage: "recover", revision: 3, editId: null, state: state() })
    expect(await h.connection.whenIdle()).toBe(true)
    expect(backend.requests.at(-1)).toMatchObject({
      stage: "recover",
      baseRevision: 0,
      revision: 3,
    })
    expect(h.statuses.at(-1)).toMatchObject({
      phase: "error",
      error: "connection",
      acceptedRevision: 3,
    })
    h.connection.submit({ stage: "commit", revision: 4, editId: "new", state: state(2) })
    expect(h.statuses.at(-1)).toMatchObject({ phase: "ready", error: null })
    stop()
    h.connection.dispose()
  })

  it("dispatches callback recovery synchronously after rejection and never retries failed recovery", async () => {
    const backend = controlled(request =>
      request.stage === "open"
        ? accepted(request)
        : {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            controlGeneration: request.controlGeneration,
            code: "rejected",
          }
    )
    const codes: BackendFailureCode[] = []
    const connection = createBackendConnection({
      factory: () => backend,
      onAccepted: () => {},
      onStatus: () => {},
      onTelemetry: () => {},
      onRejected: (request, code) => {
        codes.push(code)
        if (request.stage === "commit") {
          connection.submit({ stage: "recover", revision: 2, editId: null, state: state() })
        }
      },
    })
    connection.open("one", state())
    connection.submit({ stage: "commit", revision: 1, editId: "bad", state: state(7) })
    expect(backend.requests.map(request => request.stage)).toEqual(["open", "commit", "recover"])
    expect(codes).toEqual(["rejected", "rejected"])
    expect(await connection.whenIdle()).toBe(false)
    connection.dispose()
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

  it("buffers apply-before-ack telemetry and extrapolates no more than 250 ms", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const waiting = deferred()
    const backend = controlled(accepted, () => waiting.promise)
    const h = harness(backend)
    h.connection.open("one", state())
    const stop = h.connection.start()
    h.connection.submitControl(state(3, 1, true).control)
    backend.send(frame(backend.controls[0], 3))
    expect(h.frames).toHaveLength(0)
    waiting.resolve(accepted(backend.controls[0]))
    await Promise.resolve()
    expect(h.frames).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(h.connection.readTelemetry()?.clock.bar).toBeCloseTo(3.125)
    stop()
    h.connection.dispose()
  })

  it("rejects stale and future telemetry, wraps the loop, and advances a sample clock consistently", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const backend = controlled(accepted)
    const h = harness(backend)
    const playing = state(1, 0, true)
    playing.project.loop = { enabled: true, startBar: 1, endBar: 2 }
    h.connection.open("one", playing)
    const stop = h.connection.start()
    backend.send({
      ...frame(backend.requests[0], 1.9),
      clock: {
        kind: "sample",
        bar: 1.9,
        barsPerSecond: 0.5,
        frame: 48_000,
        sampleRate: 48_000,
      },
      playing: true,
    })
    backend.send({ ...frame(backend.requests[0], 9), sessionId: "old" })
    backend.send({ ...frame(backend.requests[0], 9), sequence: 3, appliedSequence: 3 })
    expect(h.frames).toHaveLength(1)
    vi.advanceTimersByTime(250)
    expect(h.connection.readTelemetry()?.clock.bar).toBeCloseTo(1.025)
    expect(h.connection.readTelemetry()?.clock).toMatchObject({ kind: "sample", frame: 60_000 })
    stop()
    h.connection.dispose()
  })

  it("accepts many ordered samples per command and ignores duplicates or older samples", () => {
    const backend = controlled(accepted)
    const h = harness(backend)
    h.connection.open("one", state())
    const stop = h.connection.start()
    const initial = frame(backend.requests[0], 3)
    backend.send({ ...initial, sequence: 100 })
    backend.send({
      ...initial,
      sequence: 99,
      clock: { kind: "musical", bar: 2, barsPerSecond: 0.5 },
    })
    backend.send({
      ...initial,
      sequence: 101,
      clock: { kind: "musical", bar: 4, barsPerSecond: 0.5 },
    })
    backend.send({
      ...initial,
      sequence: 101,
      clock: { kind: "musical", bar: 9, barsPerSecond: 0.5 },
    })
    expect(h.frames.map(value => value.clock.bar)).toEqual([3, 4])
    expect(h.connection.readTelemetry()?.clock.bar).toBe(4)
    stop()
    h.connection.dispose()
  })

  it("keeps actual telemetry flowing when DSP application lags a non-transport acknowledgement", () => {
    const backend = controlled(accepted)
    const h = harness(backend)
    h.connection.open("one", state())
    const stop = h.connection.start()
    backend.send({ ...frame(backend.requests[0], 2), sequence: 10 })
    h.connection.submit({ stage: "commit", revision: 1, editId: "gain", state: state() })
    backend.send({ ...frame(backend.requests[0], 3), sequence: 11 })
    backend.send({ ...frame(backend.requests[1], 4), sequence: 12 })
    backend.send({ ...frame(backend.requests[0], 9), sequence: 13 })
    expect(h.frames.map(value => value.clock.bar)).toEqual([2, 3, 4])
    stop()
    h.connection.dispose()
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

it("dispatches latest control then B then at most one control before C, assigning wire sequence at dispatch", async () => {
  const gates = new Map<number, { resolve: (value: BackendResult) => void }>()
  const backend = controlled(
    request => {
      if (request.stage === "open") return accepted(request)
      const gate = deferred()
      gates.set(request.sequence, gate)
      return gate.promise
    },
    request => {
      const gate = deferred()
      gates.set(request.sequence, gate)
      return gate.promise
    }
  )
  const h = harness(backend)
  h.connection.open("fair", state())
  for (const [index, editId] of ["A", "B", "C"].entries()) {
    h.connection.submit({ stage: "commit", revision: index + 1, editId, state: state() })
  }
  for (let i = 1; i <= 100; i++) h.connection.submitControl(state(i + 1, i, true).control)
  expect(backend.calls.map(request => request.sequence)).toEqual([0, 1])
  gates.get(1)?.resolve(accepted(backend.requests[1]))
  await Promise.resolve()
  expect(backend.controls[0]).toMatchObject({ sequence: 2, control: { seekBar: 101 } })
  expect(h.statuses.at(-1)?.acceptedRevision).toBe(1)
  h.connection.submitControl(state(102, 101, true).control)
  gates.get(2)?.resolve(accepted(backend.controls[0], 1))
  await Promise.resolve()
  expect(backend.requests[2]).toMatchObject({
    sequence: 3,
    editId: "B",
    baseRevision: 1,
    revision: 2,
    state: { control: { seekBar: 102 } },
  })
  for (let i = 102; i <= 110; i++) h.connection.submitControl(state(i + 1, i, true).control)
  gates.get(3)?.resolve(accepted(backend.requests[2]))
  await Promise.resolve()
  expect(backend.controls[1]).toMatchObject({ sequence: 4, control: { seekBar: 111 } })
  gates.get(4)?.resolve(accepted(backend.controls[1], 2))
  await Promise.resolve()
  expect(backend.requests[3]).toMatchObject({
    sequence: 5,
    editId: "C",
    baseRevision: 2,
    revision: 3,
  })
  gates.get(5)?.resolve(accepted(backend.requests[3]))
  expect(await h.connection.whenIdle()).toBe(true)
  expect(backend.calls.map(request => request.sequence)).toEqual([0, 1, 2, 3, 4, 5])
  expect(h.acceptedRequests[2].state.control.seekBar).toBe(102)
  expect(backend.controls.every(request => !("state" in request) && !("revision" in request))).toBe(
    true
  )
  h.connection.dispose()
})

it("never coalesces a preview across a commit transaction boundary", async () => {
  const waiting = deferred()
  const backend = controlled(request =>
    request.sequence === 1 ? waiting.promise : accepted(request)
  )
  const h = harness(backend)
  h.connection.open("barriers", state())
  h.connection.submit({ stage: "commit", revision: 1, editId: "A", state: state() })
  const old = state()
  old.project.bpm = 90
  h.connection.submit({ stage: "preview", revision: 1, editId: "drag", state: old })
  h.connection.submit({ stage: "commit", revision: 2, editId: "B", state: state() })
  h.connection.submit({ stage: "preview", revision: 2, editId: "drag", state: state() })
  h.connection.submit({ stage: "cancel", revision: 2, editId: "drag", state: state() })
  waiting.resolve(accepted(backend.requests[1]))
  expect(await h.connection.whenIdle()).toBe(true)
  expect(backend.requests.map(request => request.stage)).toEqual([
    "open",
    "commit",
    "preview",
    "commit",
    "cancel",
  ])
  expect(backend.requests[2].state.project.bpm).toBe(90)
  expect(backend.requests.map(request => request.baseRevision)).toEqual([0, 0, 1, 1, 2])
  h.connection.dispose()
})

it("executes the Stop fence even when the latest slot is replaced by Play", async () => {
  const waiting = deferred()
  const backend = controlled(request =>
    request.sequence === 1 ? waiting.promise : accepted(request)
  )
  const panic = vi.fn(async () => {})
  backend.urgentStop = panic
  const h = harness(backend)
  h.connection.open("stop-play", state(1, 0, true))
  h.connection.submit({ stage: "preview", revision: 0, editId: "slow", state: state(1, 0, true) })
  h.connection.submitControl(state(1, 0, false).control)
  h.connection.submitControl(state(1, 0, true).control)
  expect(panic).toHaveBeenCalledOnce()
  waiting.resolve(accepted(backend.requests[1]))
  expect(await h.connection.whenIdle()).toBe(true)
  expect(backend.controls).toHaveLength(1)
  expect(backend.controls[0].control.playing).toBe(true)
  h.connection.dispose()
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

it("fences old-generation telemetry immediately on submission, and releases only matching early control telemetry", async () => {
  const waiting = deferred()
  const backend = controlled(accepted, () => waiting.promise)
  const h = harness(backend)
  h.connection.open("generation", state())
  const release = h.connection.start()
  backend.send({ ...frame(backend.requests[0]), sequence: 10 })
  h.connection.submitControl(state(4, 1, true).control)
  expect(h.connection.readTelemetry()).toBeNull()
  backend.send({ ...frame(backend.requests[0], 99), sequence: 11 })
  backend.send({ ...frame(backend.controls[0], 4), sequence: 12 })
  expect(h.frames).toHaveLength(1)
  waiting.resolve(accepted(backend.controls[0]))
  await Promise.resolve()
  expect(h.frames.map(value => value.clock.bar)).toEqual([1, 4])
  expect(h.connection.readTelemetry()?.controlGeneration).toBe(
    backend.controls[0].controlGeneration
  )
  release()
  backend.send({ ...frame(backend.controls[0], 10), sequence: 13 })
  expect(h.connection.readTelemetry()).toBeNull()
  h.connection.dispose()
})

it("clears control-dependent documents on rejection and prioritizes recover over a pending control", async () => {
  const waiting = deferred()
  const backend = controlled(accepted, () => waiting.promise)
  const h = harness(backend)
  h.connection.open("reject-control", state())
  h.connection.submitControl(state(3, 1, true).control)
  h.connection.submit({
    stage: "commit",
    revision: 1,
    editId: "dependent",
    state: state(3, 1, true),
  })
  waiting.reject(new Error("offline"))
  expect(await h.connection.whenIdle()).toBe(false)
  expect(h.rejectedControls.map(value => value.code)).toEqual(["connection"])
  expect(backend.requests).toHaveLength(1)
  expect(h.statuses.at(-1)?.acceptedRevision).toBe(0)
  h.connection.submit({ stage: "recover", revision: 2, editId: null, state: state() })
  expect(backend.requests.at(-1)?.stage).toBe("recover")
  expect(await h.connection.whenIdle()).toBe(true)
  h.connection.dispose()
})

it("bounds independent note edges at 4096, panics on overflow, and never corrupts the document telemetry fence", async () => {
  const noteGate = deferred<BackendNoteResult>()
  const backend = controlled(accepted)
  const panic = vi.fn(async () => {})
  backend.allNotesOff = panic
  const stop = vi.fn(async () => {})
  backend.urgentStop = stop
  backend.note = request => {
    backend.notes.push(request)
    return noteGate.promise
  }
  const h = harness(backend)
  h.connection.open("notes", state(1, 0, true))
  const release = h.connection.start()
  for (let i = 0; i < 4096; i++)
    h.connection.submitNote({
      trackId: "midi",
      noteId: `n${i}`,
      pitch: 60,
      velocity: 100,
      on: true,
    })
  expect(backend.notes).toHaveLength(1)
  h.connection.submitNote({ trackId: "midi", noteId: "n0", pitch: 60, velocity: 0, on: false })
  expect(h.rejectedNotes).toEqual(["note-overrun"])
  expect(panic).toHaveBeenCalledOnce()
  expect(stop).not.toHaveBeenCalled()
  noteGate.resolve({ kind: "accepted", sessionId: "notes", sequence: 1 })
  await Promise.resolve()
  expect(backend.notes).toHaveLength(1)
  expect(await h.connection.whenIdle()).toBe(false)
  backend.send({ ...frame(backend.requests[0], 2), sequence: 10 })
  expect(h.connection.readTelemetry()?.clock.bar).toBeCloseTo(2)
  expect(h.connection.readTelemetry()?.playing).toBe(true)
  expect(h.statuses.at(-1)?.acceptedRevision).toBe(0)
  release()
  h.connection.dispose()
})

it("ignores old note rejection after reopening without panicking the new session", async () => {
  const gate = deferred<BackendNoteResult>()
  const first = controlled(accepted)
  first.note = request => {
    first.notes.push(request)
    return gate.promise
  }
  const second = controlled(accepted)
  const panic = vi.fn(async () => {})
  second.allNotesOff = panic
  let count = 0
  const errors: string[] = []
  const connection = createBackendConnection({
    factory: () => (++count === 1 ? first : second),
    onAccepted: () => {},
    onRejected: () => {},
    onStatus: () => {},
    onTelemetry: () => {},
    onNoteRejected: code => {
      errors.push(code)
    },
  })
  connection.open("old", state())
  connection.submitNote({ trackId: "midi", noteId: "old", pitch: 60, velocity: 100, on: true })
  connection.open("new", state())
  gate.resolve({ kind: "rejected", sessionId: "old", sequence: 1, code: "note-overrun" })
  await Promise.resolve()
  expect(errors).toEqual([])
  expect(panic).not.toHaveBeenCalled()
  expect(await connection.whenIdle()).toBe(true)
  connection.dispose()
})

it("parses control generations as bounded u64 BigInts rather than lossy numbers", () => {
  expect(controlGenerationValue("9007199254740993")).toBe(9007199254740993n)
  expect(controlGenerationValue("18446744073709551615")).toBe(18446744073709551615n)
  for (const value of ["18446744073709551616", "-1", "01", "1.5", "", 1]) {
    expect(controlGenerationValue(value)).toBeNull()
  }
})

it("holds new note edges until the guaranteed all-notes-off operation completes", async () => {
  const noteGate = deferred<BackendNoteResult>()
  const panicGate = deferred<undefined>()
  const backend = controlled(accepted)
  backend.allNotesOff = () => panicGate.promise
  let first = true
  backend.note = request => {
    backend.notes.push(request)
    if (first) {
      first = false
      return noteGate.promise
    }
    return { kind: "accepted", sessionId: request.sessionId, sequence: request.sequence }
  }
  const h = harness(backend)
  h.connection.open("panic-order", state(1, 0, true))
  h.connection.submitNote({ trackId: "midi", noteId: "failed", pitch: 60, velocity: 100, on: true })
  noteGate.resolve({
    kind: "rejected",
    sessionId: "panic-order",
    sequence: 1,
    code: "note-overrun",
  })
  await Promise.resolve()
  h.connection.submitNote({ trackId: "midi", noteId: "new", pitch: 62, velocity: 100, on: true })
  expect(backend.notes).toHaveLength(1)
  panicGate.resolve(undefined)
  await Promise.resolve()
  expect(backend.notes.map(request => request.note.noteId)).toEqual(["failed", "new"])
  expect(backend.controls).toHaveLength(0)
  expect(backend.requests).toHaveLength(1)
  h.connection.dispose()
})

it("holds reentrant note submission behind an asynchronous panic", async () => {
  const panic = deferred<undefined>()
  const backend = controlled(accepted)
  backend.allNotesOff = () => panic.promise
  backend.note = request => {
    backend.notes.push(request)
    return request.sequence === 1
      ? {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "note-overrun",
        }
      : { kind: "accepted", sessionId: request.sessionId, sequence: request.sequence }
  }
  const connection = createBackendConnection({
    factory: () => backend,
    onAccepted: () => {},
    onRejected: () => {},
    onStatus: () => {},
    onTelemetry: () => {},
    onNoteRejected: () =>
      connection.submitNote({
        trackId: "midi",
        noteId: "replacement",
        pitch: 62,
        velocity: 100,
        on: true,
      }),
  })
  connection.open("reentrant-panic", state())
  connection.submitNote({ trackId: "midi", noteId: "failed", pitch: 60, velocity: 100, on: true })
  expect(backend.notes.map(request => request.note.noteId)).toEqual(["failed"])
  panic.resolve(undefined)
  await Promise.resolve()
  expect(backend.notes.map(request => request.note.noteId)).toEqual(["failed", "replacement"])
  connection.dispose()
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
