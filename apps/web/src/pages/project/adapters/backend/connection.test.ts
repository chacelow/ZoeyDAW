import { afterEach, describe, expect, it, vi } from "vitest"
import { createMockDocument } from "@/pages/project/adapters/fixtures"
import { createBackendConnection } from "./connection"
import { projectBackendDocument } from "./projection"
import type {
  BackendFailureCode,
  BackendRequest,
  BackendResult,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
  ProjectRuntimeStatus,
} from "@/pages/project/model/backend"

function state(seekBar = 1, seekGeneration = 0, playing = false): BackendState {
  return {
    project: projectBackendDocument(createMockDocument()),
    control: {
      playing,
      recording: false,
      seekBar,
      seekGeneration,
      heldNotes: [],
      midiVelocity: 100,
    },
  }
}
function deferred() {
  let resolve: (result: BackendResult) => void = () => {
    throw new Error("Uninitialized result")
  }
  let reject: (reason: Error) => void = () => {
    throw new Error("Uninitialized rejection")
  }
  const promise = new Promise<BackendResult>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function accepted(request: BackendRequest): BackendResult {
  return {
    kind: "accepted",
    sessionId: request.sessionId,
    sequence: request.sequence,
    revision: request.revision,
  }
}
function frame(request: BackendRequest, bar = 1): BackendTelemetry {
  return {
    sessionId: request.sessionId,
    sequence: request.sequence,
    appliedSequence: request.sequence,
    clock: { kind: "musical", bar, barsPerSecond: 0.5 },
    playing: request.state.control.playing,
    recording: false,
    levels: { main: [-12, -12] },
  }
}

interface ControlledBackend extends ProjectBackend {
  requests: BackendRequest[]
  listeners: Set<(frame: BackendTelemetry) => void>
  disposed: boolean
  send: (frame: BackendTelemetry) => void
}
function controlled(
  apply: (request: BackendRequest) => BackendResult | Promise<BackendResult>
): ControlledBackend {
  const requests: BackendRequest[] = []
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  const backend: ControlledBackend = {
    requests,
    listeners,
    disposed: false,
    apply(request) {
      requests.push(request)
      return apply(request)
    },
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
  const acceptedRequests: BackendRequest[] = []
  const rejectedRequests: { request: BackendRequest; code: BackendFailureCode }[] = []
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
    onStatus: status => {
      statuses.push(status)
    },
    onTelemetry: value => {
      frames.push(value)
    },
  })
  return { connection, acceptedRequests, rejectedRequests, statuses, frames }
}

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
    expect(backend.requests.map(request => request.sequence)).toEqual([0, 1, 4, 5])
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
    const backend = controlled(request =>
      request.sequence === 1 ? waiting.promise : accepted(request)
    )
    const h = harness(backend)
    h.connection.open("one", state())
    const stop = h.connection.start()
    h.connection.submit({ stage: "transport", revision: 0, editId: null, state: state(3, 1, true) })
    backend.send(frame(backend.requests[1], 3))
    expect(h.frames).toHaveLength(0)
    waiting.resolve(accepted(backend.requests[1]))
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
