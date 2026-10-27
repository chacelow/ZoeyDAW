// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import * as waveformRanges from "@/pages/project/adapters/backend/waveform-ranges"
import type { BrowserAudioDragSource } from "@/pages/project/adapters/browser"
import type { WaveformRange } from "@zoeydaw/project-core/waveform-range"
import { arrangementScene } from "../canvas/scene"
import { useBrowserDropWaveform } from "./useBrowserDropWaveform"
import type { BrowserAudioPlacement } from "./browser-audio-placement"

const source: BrowserAudioDragSource = {
  token: "preview-token",
  path: "/audio/voice.wav",
  name: "voice.wav",
  durationSeconds: null,
}
const target: BrowserAudioPlacement = {
  startBar: 1,
  trackId: undefined,
  left: 0,
  top: 100,
  width: null,
  height: 80,
  color: "#446688",
}
const samples: WaveformRange = {
  kind: "samples",
  sampleRate: 48000,
  totalFrames: 96000,
  startFrame: 0,
  frameCount: 4,
  channels: [[-0.5, 0.25, -0.1, 0.8]],
}

function publishRange(data: WaveformRange, columns: number) {
  const metadataRequest = waveformRanges.browserWaveformMetadataRequest(source.path)
  const request = {
    sourceKey: metadataRequest.sourceKey,
    request: {
      ...metadataRequest.request,
      startFrame: data.startFrame,
      frameCount: data.frameCount,
      columns,
      framesPerBin: data.kind === "samples" ? 1 : data.framesPerBin,
    },
  }
  const entries = new Map(waveformRanges.useWaveformRanges.getState().entries)
  entries.set(waveformRanges.waveformRangeRequestKey(request), {
    kind: "ready",
    range: { sourceKey: request.sourceKey, data },
  })
  waveformRanges.useWaveformRanges.setState({ entries })
}

beforeEach(() => {
  waveformRanges.useWaveformRanges.setState({ entries: new Map() })
  vi.spyOn(waveformRanges, "setWaveformRangeDemand").mockImplementation(() => {})
  vi.spyOn(waveformRanges, "releaseWaveformRangeDemand").mockImplementation(() => {})
  arrangementScene.setViewport({
    width: 500,
    height: 700,
    scrollX: 0,
    scrollY: 0,
    pxPerBar: 100,
    dpr: 1,
  })
})
afterEach(() => {
  cleanup()
  waveformRanges.useWaveformRanges.setState({ entries: new Map() })
  vi.restoreAllMocks()
})

it("immediately exposes real cached signed ranges and retains their demand separately", () => {
  publishRange({ ...samples, frameCount: 1, channels: [[-0.5]] }, 1)
  publishRange(samples, 2)
  const { result, unmount } = renderHook(() => useBrowserDropWaveform(source, target))
  expect(result.current.media).toMatchObject({
    id: "browser-preview/preview-token",
    sha256: "",
    sampleRate: 48000,
    frames: 96000,
    channels: 1,
    location: { kind: "external", path: source.path },
  })
  expect(result.current.durationSeconds).toBe(2)
  expect(result.current.ranges).toContain(samples)
  const demand = vi.mocked(waveformRanges.setWaveformRangeDemand).mock.calls[0]
  expect(demand[1]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        request: expect.objectContaining({ frameCount: 4, framesPerBin: 1 }),
      }),
    ])
  )
  expect(waveformRanges.releaseWaveformRangeDemand).not.toHaveBeenCalled()
  unmount()
  expect(waveformRanges.releaseWaveformRangeDemand).toHaveBeenCalledExactlyOnceWith(demand[0])
})

it("keeps unknown metadata honest then requests bounded visible data after metadata arrives", () => {
  const { result, rerender, unmount } = renderHook(() => useBrowserDropWaveform(source, target))
  expect(result.current).toEqual({ media: null, ranges: [], durationSeconds: null })
  expect(waveformRanges.setWaveformRangeDemand).toHaveBeenCalledTimes(1)
  expect(vi.mocked(waveformRanges.setWaveformRangeDemand).mock.calls[0][1]).toEqual([
    waveformRanges.browserWaveformMetadataRequest(source.path),
  ])
  act(() => publishRange({ ...samples, frameCount: 1, channels: [[-0.5]] }, 1))
  expect(result.current.durationSeconds).toBe(2)
  expect(result.current.media?.frames).toBe(96000)
  expect(waveformRanges.setWaveformRangeDemand).toHaveBeenCalledTimes(2)
  const demand = vi.mocked(waveformRanges.setWaveformRangeDemand).mock.calls[1]
  expect(demand[1].length).toBeGreaterThan(1)
  for (const { request } of demand[1]) {
    expect(request.columns).toBeLessThanOrEqual(4096)
    expect(request.frameCount).toBeLessThanOrEqual(
      request.framesPerBin === 1 ? 8192 : 4096 * request.framesPerBin
    )
  }
  rerender()
  expect(waveformRanges.setWaveformRangeDemand).toHaveBeenCalledTimes(2)
  expect(waveformRanges.releaseWaveformRangeDemand).not.toHaveBeenCalled()
  unmount()
  expect(waveformRanges.releaseWaveformRangeDemand).toHaveBeenCalledExactlyOnceWith(demand[0])
})

it("loads the original-speed source window after a tempo boundary", () => {
  const initial = arrangementScene.get()
  arrangementScene.setMusic({
    ...initial,
    transport: {
      bpm: 120,
      numerator: 4,
      denominator: 4,
      tempo: [
        { bar: 1, bpm: 120 },
        { bar: 2, bpm: 240 },
      ],
    },
  })
  arrangementScene.setViewport({ ...initial.viewport, width: 1, pxPerBar: 96000, scrollX: 144000 })
  publishRange({ ...samples, totalFrames: 480000, frameCount: 1, channels: [[-0.5]] }, 1)
  renderHook(() => useBrowserDropWaveform(source, target))
  const demand = vi.mocked(waveformRanges.setWaveformRangeDemand).mock.calls.at(-1)?.[1] ?? []
  const detail = demand.filter(
    ({ request }) => request.framesPerBin === 1 && request.frameCount > 1
  )
  expect(
    detail.some(
      ({ request }) =>
        request.startFrame <= 120000 && request.startFrame + request.frameCount > 120000
    )
  ).toBe(true)
  expect(
    detail.every(({ request }) => request.startFrame > 110000 && request.startFrame < 130000)
  ).toBe(true)
  arrangementScene.setMusic(initial)
})
