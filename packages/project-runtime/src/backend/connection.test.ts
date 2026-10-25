import { afterEach, describe, expect, it, vi } from "vitest"
import { createBackendConnection } from "./connection"
import type { BackendFailureCode, BackendResult } from "@zoeydaw/project-core/backend"
import { state, deferred, accepted, frame, controlled, harness } from "./connection.testing"

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
