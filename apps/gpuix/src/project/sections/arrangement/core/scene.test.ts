import { DEFAULT_LAYOUT_TOKENS, createLayoutTokens } from "@/shared/theme/layout-tokens"
import { describe, expect, it, jest } from "bun:test"
import { createSceneStore } from "./scene"
import type { ArrangementViewport } from "./scene"
import type { LoopRegion, Marker, Track } from "../../../model/types"
import { createMockDocument } from "@/project/adapters/fixtures"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { layoutTrackRows } from "./layout"
import { hitTest } from "./hit-test"

const vp = (patch: Partial<ArrangementViewport> = {}): ArrangementViewport => ({
  pxPerBar: 24,
  scrollX: 0,
  scrollY: 0,
  width: 800,
  height: 400,
  dpr: 1,
  ...patch,
})

const loop: LoopRegion = { enabled: false, startBar: 1, endBar: 5 }
const markers: readonly Marker[] = []
const tracks: readonly Track[] = []
const transport = { bpm: 120, numerator: 4, denominator: 4 }
const fixedOne = { mode: "fixed", bars: 1 } as const

describe("arrangement scene store", () => {
  it("bumps revision only when a field actually changes", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    store.setViewport(vp())
    const baseline = store.get().revision
    store.setViewport(vp())
    expect(store.get().revision).toBe(baseline)
    store.setViewport(vp({ scrollX: 32 }))
    expect(store.get().revision).toBe(baseline + 1)
    store.setViewport(vp({ scrollX: 32 }))
    expect(store.get().revision).toBe(baseline + 1)
  })

  it("derives a new cell on zoom without rewriting grid preference", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    store.setMusic({
      bars: 128,
      grid: { mode: "adaptive", density: "narrowest" },
      transport,
      markers,
      loop,
      tracks,
    })
    const previous = store.get().grid
    store.setViewport(vp({ pxPerBar: 128 }))
    const coarse = store.get().gridPlan.cellBars
    store.setViewport(vp({ pxPerBar: 131_072 }))
    expect(store.get().grid).toBe(previous)
    expect(store.get().gridPlan.cellBars).toBe(1 / 16_384)
    expect(coarse).toBeGreaterThan(store.get().gridPlan.cellBars)
  })

  it("bridges stopped playback and track-local insertion independently of music", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    store.setPlayback({
      playing: false,
      insertionPoint: { trackId: "3-audio", bar: 1 + 1 / 16_384 },
    })
    expect(store.get().playback.insertionPoint?.bar).toBe(1 + 1 / 16_384)
    const { revision } = store.get()
    store.setPlayback({
      playing: false,
      insertionPoint: { trackId: "3-audio", bar: 1 + 1 / 16_384 },
    })
    expect(store.get().revision).toBe(revision)
  })

  it("notifies subscribers once per real change", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    const listener = jest.fn()
    const detach = store.subscribe(listener)
    store.setViewport(vp({ scrollX: 32 }))
    store.setMusic({ bars: 128, grid: fixedOne, transport, markers, loop, tracks })
    detach()
    store.setViewport(vp({ scrollX: 64 }))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("treats identical track and marker references as unchanged music", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    const r0 = store.get().revision
    store.setMusic({ bars: 128, grid: fixedOne, transport, markers, loop, tracks })
    const r1 = store.get().revision
    store.setMusic({ bars: 128, grid: fixedOne, transport, markers, loop, tracks })
    expect(store.get().revision).toBe(r1)
    store.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 2 },
      transport,
      markers,
      loop,
      tracks,
    })
    expect(store.get().revision).toBe(r1 + 1)
    expect(store.get().revision).toBeGreaterThan(r0)
  })

  it("keeps transient gesture tracks out of the durable music update", () => {
    const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    store.setMusic({ bars: 128, grid: fixedOne, transport, markers, loop, tracks })
    const preview: Track[] = [
      {
        id: "preview",
        kind: "audio",
        name: "Preview",
        clips: [],
        color: "var(--chart-1)",
        input: "none",
        output: "main",
        volumeDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
        heightPx: 56,
        monitor: "auto",
        automation: [],
      },
    ]
    store.setProjectPreview({
      kind: "tracks",
      token: { sessionId: "renderer", id: "gesture" },
      tracks: preview,
    })
    expect(store.get().tracks).toBe(preview)
    store.setMusic({ bars: 144, grid: fixedOne, transport, markers, loop, tracks })
    expect(store.get().tracks).toBe(preview)
    store.setProjectPreview(null)
    expect(store.get().tracks).toBe(tracks)
    expect(store.get().previewTracks).toBeNull()
  })
})

it("runtime geometry changes move rendering and hit ownership together without replacing music", () => {
  const owner = createMockDocument().tracks.find(track => track.kind === "audio")
  if (!owner) throw new Error("Missing audio fixture")
  const first = { ...owner, id: "first", collapsed: true, clips: [] }
  const second = { ...owner, id: "second", collapsed: true, clips: [] }
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  store.setViewport(vp())
  store.setMusic({ bars: 128, grid: fixedOne, transport, markers, loop, tracks: [first, second] })
  store.setTrackSelection(new Set(["second"]))
  expect(layoutTrackRows(store.get()).map(row => [row.top, row.height])).toEqual([
    [34, 23],
    [57, 23],
  ])
  expect(hitTest(store.get(), 100, 64)?.track.id).toBe("second")
  store.setGeometry(
    createLayoutTokens(
      {
        ...CONTROL_METRICS.default,
        "--spacing-control-track": 20,
        "--spacing-control-track-gap": 6,
      },
      { ...PROJECT_METRICS, trackBorder: 4 }
    )
  )
  expect(layoutTrackRows(store.get()).map(row => [row.top, row.height])).toEqual([
    [34, 36],
    [70, 36],
  ])
  expect(hitTest(store.get(), 100, 64)?.track.id).toBe("first")
  expect([...store.get().selectedTrackIds]).toEqual(["second"])
  expect(store.get().tracks.map(track => track.id)).toEqual(["first", "second"])
})
