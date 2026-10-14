import { afterEach, describe, expect, it, jest, setSystemTime } from "bun:test"
import { createMockDocument } from "../fixtures"
import { createMockProjectBackend } from "./mock"
import { projectBackendDocument } from "./projection"
import type { BackendRequest, BackendState, BackendTelemetry } from "../../model/backend"

function state(): BackendState {
  return {
    project: projectBackendDocument(createMockDocument()),
    control: {
      playing: true,
      recording: false,
      seekBar: 1,
      seekGeneration: 0,
      heldNotes: [],
      midiVelocity: 100,
    },
  }
}
function request(
  value: BackendState,
  sequence = 0,
  stage: BackendRequest["stage"] = "open",
  revision = 0
): BackendRequest {
  return {
    protocolVersion: 1,
    sessionId: "s",
    sequence,
    baseRevision: 0,
    revision,
    stage,
    editId: null,
    state: value,
  }
}

afterEach(() => {
  jest.useRealTimers()
})

describe("mock project backend", () => {
  it("projects only playback state and stable URI sources, excluding visual payloads", () => {
    const document = createMockDocument()
    const projected = projectBackendDocument(document)
    const audio = projected.tracks.find(track => track.id === "3-audio")
    expect(projected.sources).toContainEqual({ id: "mock://kick.wav", uri: "mock://kick.wav" })
    expect(audio?.clips.find(clip => clip.kind === "audio")).toMatchObject({
      sourceId: "mock://kick.wav",
    })
    expect(JSON.stringify(projected)).not.toContain("waveformPeaks")
    expect(JSON.stringify(projected)).not.toContain("heightPx")
    expect(JSON.stringify(projected)).not.toContain("3 Audio")
    expect(JSON.stringify(projected)).not.toContain("var(--chart-")
    expect(JSON.stringify(projected)).not.toContain("markers")
    document.tracks[0].name = "Changed label"
    expect(JSON.stringify(projected)).not.toContain("Changed label")
  })

  it("owns its clock only during subscriptions and responds to routed signal and loop", () => {
    jest.useFakeTimers()
    setSystemTime(0)
    const backend = createMockProjectBackend()
    const value = state()
    value.project.loop = { enabled: true, startBar: 1, endBar: 2 }
    expect(backend.apply(request(value))).toEqual({
      kind: "accepted",
      sessionId: "s",
      sequence: 0,
      revision: 0,
    })
    expect(jest.getTimerCount()).toBe(0)
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(jest.getTimerCount()).toBe(1)
    expect(frames[0].levels["3-audio"][0]).toBeGreaterThan(-60)
    jest.advanceTimersByTime(1500)
    expect(frames.at(-1)?.clock.bar).toBeCloseTo(1.75)
    stop()
    expect(jest.getTimerCount()).toBe(0)
    backend.dispose()
    expect(jest.getTimerCount()).toBe(0)
  })

  it("does not schedule stopped meters, starts held-note activity, and stops on release", () => {
    jest.useFakeTimers()
    const backend = createMockProjectBackend()
    const stopped = state()
    stopped.control.playing = false
    backend.apply(request(stopped))
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(frames).toHaveLength(1)
    expect(jest.getTimerCount()).toBe(0)
    const held = state()
    held.control.playing = false
    held.control.heldNotes = [60]
    backend.apply(request(held, 1, "transport"))
    expect(jest.getTimerCount()).toBe(1)
    backend.apply(request(stopped, 2, "transport"))
    expect(jest.getTimerCount()).toBe(0)
    stop()
    backend.dispose()
  })

  it("accepts skipped coalesced sequences, rejects stale revision without mutating active state", () => {
    jest.useFakeTimers()
    const backend = createMockProjectBackend()
    const value = state()
    backend.apply(request(value))
    const changed = state()
    changed.control.seekBar = 5
    changed.control.seekGeneration = 1
    expect(backend.apply(request(changed, 3, "transport"))).toMatchObject({
      kind: "accepted",
      sequence: 3,
    })
    expect(backend.apply(request(state(), 2, "commit", 1))).toMatchObject({
      kind: "rejected",
      code: "protocol",
    })
    const frames: BackendTelemetry[] = []
    const stop = backend.subscribe(frame => {
      frames.push(frame)
    })
    expect(frames[0].clock.bar).toBe(5)
    stop()
    backend.dispose()
  })
})
