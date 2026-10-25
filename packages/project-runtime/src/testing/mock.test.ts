import { afterEach, describe, expect, it, vi } from "vitest"
import { createMockDocument } from "./fixtures"
import { createMockProjectBackend } from "./mock"
import { projectBackendDocument } from "../backend/projection"
import type {
  BackendControlRequest,
  BackendDocumentRequest,
  BackendNoteRequest,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"

function peaks(backend: ProjectBackend, endpointId: string): number[] {
  const snapshot = backend.readMeters?.()?.readLatest()
  if (!snapshot) throw new Error("Expected mock meter frame")
  return snapshot.registry.entries
    .filter(entry => entry.endpointId === endpointId)
    .map(entry => snapshot.records.get(entry.slotId)?.peak ?? -1)
}

function state(): BackendState {
  return {
    project: projectBackendDocument(createMockDocument(108)),
    control: { playing: true, recording: false, seekBar: 1, seekGeneration: 0 },
  }
}
function request(
  value: BackendState,
  sequence = 0,
  stage: BackendDocumentRequest["stage"] = "open",
  revision = 0
): BackendDocumentRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence,
    baseRevision: 0,
    revision,
    stage,
    editId: null,
    controlGeneration: String(sequence),
    state: value,
  }
}
function control(
  value: BackendState,
  sequence: number,
  generation = String(sequence)
): BackendControlRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence,
    controlGeneration: generation,
    control: value.control,
  }
}
function note(trackId: string, noteId: string, sequence: number, on: boolean): BackendNoteRequest {
  return {
    protocolVersion: 2,
    sessionId: "s",
    sequence,
    note: { trackId, noteId, pitch: 60, velocity: on ? 100 : 0, on },
  }
}
afterEach(() => vi.useRealTimers())

describe("mock project backend", () => {
  it("owns its clock only during subscriptions and responds to routed signal and loop", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const backend = createMockProjectBackend()
    const value = state()
    value.project.loop = { enabled: true, startBar: 1, endBar: 2 }
    expect(backend.apply(request(value))).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
      controlGeneration: "0",
    })
    expect(vi.getTimerCount()).toBe(0)
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(vi.getTimerCount()).toBe(1)
    expect(peaks(backend, "3-audio")[0]).toBeGreaterThan(0)
    const meter = backend.readMeters?.()
    expect(
      meter?.readLatest()?.registry.entries.find(entry => entry.endpointId === "3-audio")?.kind
    ).toBe("track-out")
    expect(
      meter?.readLatest()?.registry.entries.find(entry => entry.endpointId === "main")?.kind
    ).toBe("master")
    expect(
      meter?.readLatest()?.registry.entries.find(entry => entry.endpointId === "a-apply")?.kind
    ).toBe("bus")
    const registryRevision = meter?.readLatest()?.registry.registryRevision
    backend.control(control(value, 1))
    expect(meter?.readLatest()?.registry.registryRevision).toBe(registryRevision)
    vi.advanceTimersByTime(1500)
    expect(meter?.readLatest()?.frame.header.seq).toBeGreaterThan(1n)
    expect(frames.at(-1)?.clock.bar).toBeCloseTo(1.75)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    backend.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("schedules stopped activity only from ordered note edges and releases the original identity", () => {
    vi.useFakeTimers()
    const backend = createMockProjectBackend()
    const stopped = state()
    stopped.control.playing = false
    const midi = stopped.project.tracks.find(track => track.kind === "midi")
    if (!midi) throw new Error("Fixture needs a MIDI track")
    backend.apply(request(stopped))
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(frames).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(backend.note(note(midi.id, "key-60", 1, true))).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
    })
    expect(vi.getTimerCount()).toBe(1)
    expect(peaks(backend, midi.id)[0]).toBeGreaterThan(0)
    backend.control(control(stopped, 1))
    expect(vi.getTimerCount()).toBe(1)
    expect(backend.note(note(midi.id, "different-key", 2, false))).toMatchObject({
      kind: "accepted",
    })
    expect(vi.getTimerCount()).toBe(1)
    backend.note(note(midi.id, "key-60", 3, false))
    expect(vi.getTimerCount()).toBe(0)
    expect(peaks(backend, midi.id)).toEqual([0, 0])
    stop()
    backend.dispose()
  })

  it("applies narrow controls without replacing project or advancing revision", () => {
    vi.useFakeTimers()
    const backend = createMockProjectBackend()
    const value = state()
    backend.apply(request(value))
    const changed = state()
    changed.control.seekBar = 5
    changed.control.seekGeneration = 1
    expect(backend.control(control(changed, 1, "9007199254740993"))).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 1,
      revision: 0,
      controlGeneration: "9007199254740993",
    })
    expect(backend.apply(request(state(), 0, "commit", 1))).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(frames[0].clock.bar).toBe(5)
    expect(frames[0].controlGeneration).toBe("9007199254740993")
    stop()
    backend.dispose()
  })

  it("does not let an old document control overwrite a newer generation", () => {
    vi.useFakeTimers()
    const backend = createMockProjectBackend()
    backend.apply(request(state()))
    const changed = state()
    changed.control.seekBar = 5
    changed.control.seekGeneration = 1
    backend.control(control(changed, 1, "9007199254740993"))
    expect(backend.apply(request(state(), 2, "commit", 1))).toMatchObject({
      kind: "accepted",
      revision: 1,
      controlGeneration: "9007199254740993",
    })
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(frames[0].clock.bar).toBe(5)
    expect(frames[0].playing).toBe(true)
    stop()
    backend.dispose()
  })

  it("keeps note sequences out of appliedSequence and panics live notes on urgent stop", async () => {
    vi.useFakeTimers()
    const backend = createMockProjectBackend()
    const stopped = state()
    stopped.control.playing = false
    const midi = stopped.project.tracks.find(track => track.kind === "midi")
    if (!midi) throw new Error("Fixture needs a MIDI track")
    backend.apply(request(stopped))
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    backend.note(note(midi.id, "a", 100, true))
    expect(frames.at(-1)?.appliedSequence).toBe(0)
    expect(frames.at(-1)?.controlGeneration).toBe("0")
    expect(backend.note(note(midi.id, "a", 99, false))).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    await backend.urgentStop?.()
    expect(vi.getTimerCount()).toBe(0)
    expect(peaks(backend, midi.id)).toEqual([0, 0])
    stop()
    backend.dispose()
  })

  it("rejects malformed u64 generations and remains isolated after disposal", () => {
    const backend = createMockProjectBackend()
    backend.apply(request(state()))
    for (const value of ["-1", "01", "18446744073709551616", "1.5"]) {
      expect(backend.control(control(state(), 1, value))).toMatchObject({
        kind: "rejected",
        code: "protocol",
      })
    }
    backend.dispose()
    expect(backend.control(control(state(), 1))).toMatchObject({
      kind: "rejected",
      code: "disposed",
    })
  })
})

it("all-notes-off leaves arrangement playback and document revision intact", async () => {
  vi.useFakeTimers()
  const backend = createMockProjectBackend()
  const value = state()
  const midi = value.project.tracks.find(track => track.kind === "midi")
  if (!midi) throw new Error("Fixture needs a MIDI track")
  backend.apply(request(value))
  const frames: BackendTelemetry[] = []
  const release = backend.subscribe(frame => {
    frames.push(frame)
  })
  backend.note(note(midi.id, "held", 1, true))
  await backend.allNotesOff()
  expect(frames.at(-1)).toMatchObject({
    playing: true,
    recording: false,
    appliedSequence: 0,
    controlGeneration: "0",
  })
  expect(vi.getTimerCount()).toBe(1)
  expect(backend.control(control(value, 1))).toMatchObject({ kind: "accepted", revision: 0 })
  release()
  backend.dispose()
})

it("accepts a first native-equivalent open after locally canceled sequence gaps but rejects open replay", () => {
  const backend = createMockProjectBackend()
  expect(backend.apply(request(state(), 3))).toMatchObject({
    kind: "accepted",
    sequence: 3,
    revision: 0,
  })
  expect(backend.apply(request(state(), 4))).toMatchObject({ kind: "rejected", code: "protocol" })
  backend.dispose()
})
