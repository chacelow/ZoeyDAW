// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createMeterStore, type MeterSession } from "@zoeydaw/project-runtime/realtime"
import {
  HEADER_BYTES,
  MAGIC,
  RECORD_BYTES,
  VERSION,
  writeHeader,
  writeRecord,
} from "@zoeydaw/project-core/realtime"
import {
  publishProjectMeters,
  configureBackendMeterReader,
  synchronizeBackendMeters,
} from "@/pages/project/adapters/realtime"
import { ProjectMeter } from "."
import { attachProjectMeterScheduler } from "./scheduler"
import { createMockProjectBackend, createMockDocument } from "@zoeydaw/project-runtime/testing"
import { projectBackendDocument } from "@zoeydaw/project-runtime/backend-projection"

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let detach = () => {}
afterEach(() => {
  cleanup()
  detach()
  publishProjectMeters(null)
  configureBackendMeterReader(() => null)
  synchronizeBackendMeters()
  vi.unstubAllGlobals()
})

it("paints distinct device stages from binary without an Arrangement view and removes interests on unmount", () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id)
  })
  const store = createMeterStore()
  store.bindStream(7, "ui")
  store.acceptRegistry(
    {
      sessionId: "ui",
      sessionEpoch: 1,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: 1,
      resetEpoch: 0,
      entries: ["in", "out"].map((side, slotId) => ({
        slotId,
        endpointId: `device/gain/${side}`,
        kind: side === "in" ? "device-in" : "device-out",
        ownerId: "gain",
        channelIndex: 0,
        channelCount: 1,
        capabilities: ["peak"],
      })),
      sources: [],
      endpointResets: ["in", "out"].map((side, slotId) => ({
        endpointId: `device/gain/${side}`,
        slotIds: [slotId],
        slotResetEpoch: 0,
      })),
    },
    7
  )
  const bytes = new ArrayBuffer(HEADER_BYTES + 2 * RECORD_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: 1,
    streamId: 7,
    slotCount: 2,
    seq: 1n,
    timeSamples: 256n,
    sampleRate: 48000,
    producedMonotonicNs: 1n,
    controlGeneration: 0n,
    acceptedRevision: 0n,
    audioRevision: 0n,
    subscriptionRevision: 1,
    flags: 0,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 120,
    deviceEpoch: 1,
    sourceCount: 0,
    resetEpoch: 0,
    frameType: 1,
  })
  for (const [slotId, peak] of [1, 0.25].entries())
    writeRecord(
      view,
      {
        slotId,
        peak,
        rms: peak,
        hold: peak,
        sessionPeak: peak,
        blockEndSample: 256n,
        clipCount: 0n,
        flags: 1,
        validFrames: 256,
        slotResetEpoch: 0,
      },
      HEADER_BYTES + slotId * RECORD_BYTES
    )
  let adopted = false
  let hidden = false
  const statusListeners = new Set<() => void>()
  const session: MeterSession = {
    store,
    ready: Promise.resolve(),
    refresh: async () => {},
    tick() {
      if (!adopted) {
        adopted = store.acceptFrame(bytes)
      }
    },
    setVisible(next) {
      hidden = !next
      if (hidden) store.markStale()
      for (const listener of statusListeners) listener()
    },
    reset: async () => ({ resetEpoch: 0, affected: [] }),
    readStatus: () => ({ state: hidden ? "hidden" : "running", rateHz: 60, error: null }),
    subscribeStatus(listener) {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    },
    readFrameAge: () => null,
    recordPaint() {},
    dispose: async () => {
      store.dispose()
    },
  }
  publishProjectMeters(session)
  const rendered = render(
    <>
      <ProjectMeter source={{ kind: "device", deviceId: "gain", side: "in" }} label="Input" />
      <ProjectMeter source={{ kind: "device", deviceId: "gain", side: "out" }} label="Output" />
    </>
  )
  detach = attachProjectMeterScheduler()
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  })
  const fill = (name: string) =>
    rendered.getByRole("img", { name }).querySelector<HTMLElement>("[data-meter-fill]")?.style
      .clipPath
  expect(Number.parseFloat(fill("Input")?.replace("inset(", "") ?? "")).toBeCloseTo(9.09091, 4)
  expect(Number.parseFloat(fill("Output")?.replace("inset(", "") ?? "")).toBeCloseTo(27.33515, 4)
  const metadataChanged = vi.fn()
  const detachMetadata = store.subscribeMetadata(metadataChanged)
  rendered.rerender(
    <>
      <ProjectMeter source={{ kind: "device", deviceId: "gain", side: "in" }} label="Input" />
      <ProjectMeter source={{ kind: "device", deviceId: "gain", side: "out" }} label="Output" />
    </>
  )
  expect(metadataChanged).not.toHaveBeenCalled()
  detachMetadata()
  expect(store.readMetadata().endpointIds).toEqual(["device/gain/in", "device/gain/out"])
  act(() => {
    session.setVisible(false)
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  })
  expect(fill("Input")).toBe("inset(100% 0 0 0)")
  expect(frames.size).toBe(0)
  act(() => session.setVisible(true))
  expect(frames.size).toBe(1)
  rendered.unmount()
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  })
  expect(frames.size).toBe(0)
  expect(store.readMetadata().endpointIds).toEqual([])
  store.dispose()
})

it("updates a stopped Gallery MIDI meter from its store without moving transport", async () => {
  const backend = createMockProjectBackend()
  const document = createMockDocument(108)
  const midi = document.tracks.find(track => track.kind === "midi")
  if (!midi) throw new Error("Missing MIDI fixture")
  await backend.apply({
    protocolVersion: 2,
    sessionId: "mock-meter-ui",
    sequence: 0,
    baseRevision: 0,
    revision: 0,
    stage: "open",
    editId: null,
    controlGeneration: "0",
    state: {
      project: projectBackendDocument(document),
      control: { playing: false, recording: false, seekBar: 1, seekGeneration: 0 },
    },
  })
  configureBackendMeterReader(() => backend.readMeters?.() ?? null)
  synchronizeBackendMeters()
  const rendered = render(
    <ProjectMeter source={{ kind: "track", trackId: midi.id }} label="MIDI" />
  )
  const fill = () =>
    rendered.getByRole("img", { name: "MIDI" }).querySelector<HTMLElement>("[data-meter-fill]")
      ?.style.clipPath
  expect(fill()).toBe("inset(100% 0 0 0)")
  await act(async () => {
    await backend.note({
      protocolVersion: 2,
      sessionId: "mock-meter-ui",
      sequence: 1,
      note: { trackId: midi.id, noteId: "held", pitch: 60, velocity: 100, on: true },
    })
  })
  expect(Number.parseFloat(fill()?.replace("inset(", "") ?? "")).toBeLessThan(100)
  await act(async () => {
    await backend.note({
      protocolVersion: 2,
      sessionId: "mock-meter-ui",
      sequence: 2,
      note: { trackId: midi.id, noteId: "held", pitch: 60, velocity: 0, on: false },
    })
  })
  expect(fill()).toBe("inset(100% 0 0 0)")
  rendered.unmount()
  backend.dispose()
})
