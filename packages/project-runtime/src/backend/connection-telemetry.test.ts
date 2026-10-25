import { afterEach, describe, expect, it, vi } from "vitest"

import { state, deferred, accepted, frame, controlled, harness } from "./connection.testing"

afterEach(() => vi.useRealTimers())

describe("backend connection", () => {
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

  it("does not retract the displayed playhead when a slower audio clock replaces extrapolation", () => {
    vi.useFakeTimers()
    const backend = controlled(accepted)
    const h = harness(backend)
    h.connection.open("one", state(1, 0, true))
    const stop = h.connection.start()
    backend.send({ ...frame(backend.requests[0], 3), sequence: 1 })
    vi.advanceTimersByTime(32)
    const before = h.connection.readTelemetry()!.clock.bar
    backend.send({
      ...frame(backend.requests[0], 3.008),
      sequence: 2,
      clock: { kind: "musical", bar: 3.008, barsPerSecond: 0.25 },
    })
    expect(h.connection.readTelemetry()!.clock.bar).toBeGreaterThanOrEqual(before)
    vi.advanceTimersByTime(16)
    expect(h.connection.readTelemetry()!.clock.bar).toBeGreaterThan(before)
    vi.advanceTimersByTime(100)
    expect(h.connection.readTelemetry()!.clock.bar).toBeCloseTo(3.008 + 0.116 * 0.25)
    h.connection.submitControl(state(2, 1, true).control)
    backend.send({ ...frame(backend.controls[0], 2), sequence: 3 })
    expect(h.connection.readTelemetry()!.clock.bar).toBe(2)
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

  it("applies a real loop wrap immediately after interpolated playback", () => {
    vi.useFakeTimers()
    const backend = controlled(accepted)
    const h = harness(backend)
    const playing = state(1, 0, true)
    playing.project.loop = { enabled: true, startBar: 1, endBar: 2 }
    h.connection.open("one", playing)
    const stop = h.connection.start()
    backend.send({ ...frame(backend.requests[0], 1.99), sequence: 1 })
    vi.advanceTimersByTime(16)
    expect(h.connection.readTelemetry()!.clock.bar).toBeCloseTo(1.998)
    backend.send({ ...frame(backend.requests[0], 1.002), sequence: 2 })
    expect(h.connection.readTelemetry()!.clock.bar).toBeCloseTo(1.002)
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
