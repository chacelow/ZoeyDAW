import { afterEach, expect, it, vi } from "vitest"
import { createBackendConnection } from "./connection"
import type { BackendNoteResult } from "@zoeydaw/project-core/backend"
import { state, deferred, accepted, frame, controlled, harness } from "./connection.testing"

afterEach(() => vi.useRealTimers())

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
