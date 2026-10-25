// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { createRef } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { createMeterStore } from "@zoeydaw/project-runtime/realtime"
import {
  HEADER_BYTES,
  SOURCE_BYTES,
  MAGIC,
  VERSION,
  writeHeader,
  writeSource,
  type RealtimeRegistry,
  type WireSource,
} from "@zoeydaw/project-core/realtime"
import {
  configureBackendMeterReader,
  synchronizeBackendMeters,
  readProjectSource,
} from "@/pages/project/adapters/realtime"
import { SourcePlayhead, SourceTimeReadout } from "."

const mapping: RealtimeRegistry["sources"][number] = {
  clipHandle: 1,
  clipId: "clip",
  sourceHandle: 2,
  sourceId: "audio",
  sourceGeneration: 3,
  sourceRate: 48000,
  owner: "arrangement",
}
function registry(sources: RealtimeRegistry["sources"]): RealtimeRegistry {
  return {
    sessionId: "s",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 1,
    registryRevision: 1,
    resetEpoch: 0,
    entries: [],
    endpointResets: [],
    sources,
  }
}
function frame(source: Partial<WireSource> = {}, seq = 1n): ArrayBuffer {
  const bytes = new ArrayBuffer(HEADER_BYTES + SOURCE_BYTES)
  const view = new DataView(bytes)
  writeHeader(view, {
    magic: MAGIC,
    version: VERSION,
    headerBytes: HEADER_BYTES,
    generation: 1,
    registryRevision: 1,
    streamId: 7,
    slotCount: 0,
    seq,
    timeSamples: 0n,
    sampleRate: 0,
    producedMonotonicNs: 0n,
    controlGeneration: 0n,
    acceptedRevision: 0n,
    audioRevision: 0n,
    subscriptionRevision: 1,
    flags: 8,
    timelineSample: 0n,
    timelineBeat: 0,
    tempoBpm: 0,
    deviceEpoch: 1,
    sourceCount: 1,
    resetEpoch: 0,
    frameType: 1,
    appliedSequence: 0n,
    ownerEpoch: 1n,
    bar: 1,
    barsPerSecond: 0.5,
    audibleBar: 0,
    audibleBarsPerSecond: 0,
    observedMonotonicNs: 0n,
    transportKind: 1,
    transportFlags: 1,
  })
  writeSource(
    view,
    {
      clipHandle: 1,
      sourceHandle: 2,
      sourceFrame: 96000,
      sourceRate: 48000,
      sourceGeneration: 3,
      observedDeviceSample: 1000n,
      flags: 1,
      positionAgeSamples: 0,
      reserved: 0,
      ...source,
    },
    HEADER_BYTES
  )
  return bytes
}
const frames = new Map<number, FrameRequestCallback>()
let nextFrame = 0
function paint() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(16)
  })
}
function setup(sources = [mapping]) {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id)
  })
  const store = createMeterStore()
  store.bindStream(7, "s")
  store.acceptRegistry(registry(sources), 7)
  configureBackendMeterReader(() => store)
  synchronizeBackendMeters()
  return store
}
afterEach(() => {
  cleanup()
  configureBackendMeterReader(() => null)
  synchronizeBackendMeters()
  frames.clear()
  vi.unstubAllGlobals()
})
it("projects actual source seconds into the source viewport and hides stale or out-of-view data", () => {
  const store = setup()
  const view = render(
    <>
      <SourcePlayhead
        source={{ kind: "arrangement", clipId: "clip", sourceId: "audio" }}
        startSeconds={1}
        spanSeconds={4}
      />
      <SourceTimeReadout source={{ kind: "arrangement", clipId: "clip", sourceId: "audio" }} />
    </>
  )
  const marker = view.container.querySelector<HTMLElement>("[data-source-playhead]")!
  expect(marker.hidden).toBe(true)
  act(() => {
    expect(store.acceptFrame(frame())).toBe(true)
  })
  paint()
  expect(marker.hidden).toBe(false)
  expect(marker.style.left).toBe("25%")
  expect(view.container.textContent).toBe("2.0")
  act(() => {
    store.acceptFrame(frame({ sourceFrame: 480000 }, 2n))
  })
  paint()
  expect(marker.hidden).toBe(true)
  act(() => {
    store.markStale()
  })
  paint()
  expect(view.container.textContent).toBe("–")
  view.unmount()
  expect(store.readMetadata().transport).toBe(false)
})
it("isolates Preview identity from Arrangement and rejects retired source generations", () => {
  const preview = {
    ...mapping,
    owner: "preview",
    clipId: "preview/9",
  } satisfies RealtimeRegistry["sources"][number]
  const store = setup([preview])
  const slider = createRef<HTMLDivElement>()
  const view = render(
    <div ref={slider} role="slider" aria-valuemin={0} aria-valuemax={4} aria-valuenow={0}>
      <SourcePlayhead
        source={{ kind: "preview", clipId: "preview/9" }}
        startSeconds={0}
        spanSeconds={4}
        slider={slider}
      />
    </div>
  )
  const marker = view.container.querySelector<HTMLElement>("[data-source-playhead]")!
  act(() => {
    store.acceptFrame(frame())
  })
  paint()
  expect(marker.hidden).toBe(false)
  expect(marker.style.left).toBe("50%")
  expect(slider.current?.getAttribute("aria-valuenow")).toBe("2")
  act(() => {
    store.acceptFrame(frame({ sourceFrame: 0 }, 2n))
  })
  paint()
  expect(marker.hidden).toBe(false)
  expect(marker.style.left).toBe("0%")
  expect(slider.current?.getAttribute("aria-valuenow")).toBe("0")
  expect(
    readProjectSource({ kind: "arrangement", clipId: "preview/9", sourceId: "audio" })
  ).toBeNull()
  expect(readProjectSource({ kind: "preview", clipId: "preview/8" })).toBeNull()
  act(() => {
    store.acceptFrame(frame({ sourceGeneration: 2 }, 3n))
  })
  paint()
  expect(marker.hidden).toBe(true)
})
it("rebinds mounted source consumers when the session store changes", () => {
  const first = setup()
  const view = render(
    <SourcePlayhead
      source={{ kind: "arrangement", clipId: "clip", sourceId: "audio" }}
      startSeconds={0}
      spanSeconds={4}
    />
  )
  const marker = view.container.querySelector<HTMLElement>("[data-source-playhead]")!
  act(() => {
    first.acceptFrame(frame())
  })
  paint()
  const second = createMeterStore()
  second.bindStream(7, "s")
  second.acceptRegistry(registry([mapping]), 7)
  act(() => {
    configureBackendMeterReader(() => second)
    synchronizeBackendMeters()
  })
  paint()
  expect(marker.hidden).toBe(true)
  act(() => {
    first.acceptFrame(frame({ sourceFrame: 144000 }, 2n))
    second.acceptFrame(frame({ sourceFrame: 48000 }))
  })
  paint()
  expect(marker.style.left).toBe("25%")
  expect(first.readMetadata().transport).toBe(false)
  view.unmount()
  expect(second.readMetadata().transport).toBe(false)
})
