import { describe, expect, it } from "vitest"
import { createAudioRingBuffer } from "./ring-buffer"

describe("audio ring buffer", () => {
  it("returns the latest playhead frame and bumps revision on each write", () => {
    const rb = createAudioRingBuffer()
    const initial = rb.readRevision()
    rb.writePlayhead({ bar: 2.5, playing: true, recording: false })
    const first = rb.readPlayhead()
    expect(first.bar).toBeCloseTo(2.5)
    expect(first.playing).toBe(true)
    expect(first.recording).toBe(false)
    expect(first.revision).toBe(initial + 1)
    rb.writePlayhead({ bar: 3, playing: true, recording: true })
    expect(rb.readPlayhead()).toMatchObject({
      bar: 3,
      playing: true,
      recording: true,
      revision: initial + 2,
    })
  })

  it("keeps 1/16384-note cursor precision at later bars", () => {
    const ring = createAudioRingBuffer()
    const exact = 129 + 1 / 65_536
    ring.writePlayhead({ bar: exact, playing: true, recording: false })
    expect(ring.readPlayhead().bar).toBe(exact)
    const oddMeterBar = 257 + 3 / (7 * 16_384)
    ring.writePlayhead({ bar: oddMeterBar, playing: true, recording: true })
    expect(ring.readPlayhead().bar).toBe(oddMeterBar)
    ring.dispose()
  })

  it("tracks per-track meter slots and returns silence for unknown tracks", () => {
    const rb = createAudioRingBuffer()
    rb.writeMeter("track-a", { left: -12.5, right: -18 })
    rb.writeMeter("track-b", { left: -6, right: -6.5 })
    expect(rb.readMeter("track-a")).toMatchObject({ left: -12.5, right: -18 })
    expect(rb.readMeter("track-b")).toMatchObject({ left: -6, right: -6.5 })
    expect(rb.readMeter("missing")).toMatchObject({ left: -Infinity, right: -Infinity })
  })

  it("reuses slots across repeated writes and releases on free", () => {
    const rb = createAudioRingBuffer({ maxTracks: 2 })
    rb.allocateMeter("a")
    rb.allocateMeter("b")
    expect(() => rb.allocateMeter("c")).toThrow()
    rb.freeMeter("a")
    rb.freeMeter("b")
  })
})

it("keeps existing telemetry when the prototype grows beyond 128 tracks", () => {
  const ring = createAudioRingBuffer()
  ring.writePlayhead({ bar: 12.5, playing: true, recording: false })
  for (let index = 0; index < 300; index++) {
    ring.writeMeter(`track-${index}`, { left: -12 - index / 100, right: -20 })
  }
  expect(ring.readPlayhead().bar).toBe(12.5)
  expect(ring.readMeter("track-0")).toEqual({ left: -12, right: -20 })
  expect(ring.readMeter("track-299").left).toBeCloseTo(-14.99)
})

it("reuses freed meter capacity without replaying stale track levels", () => {
  const ring = createAudioRingBuffer({ maxTracks: 2 })
  ring.writeMeter("a", { left: -3, right: -6 })
  ring.allocateMeter("b")
  ring.freeMeter("a")
  ring.allocateMeter("c")
  expect(ring.readMeter("c")).toEqual({ left: -Infinity, right: -Infinity })
  ring.writeMeter("c", { left: -20, right: -30 })
  expect(ring.readMeter("b")).toEqual({ left: -Infinity, right: -Infinity })
  expect(ring.readMeter("a")).toEqual({ left: -Infinity, right: -Infinity })
})
