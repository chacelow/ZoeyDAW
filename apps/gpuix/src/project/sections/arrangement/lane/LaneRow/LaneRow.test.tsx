import { DEFAULT_LAYOUT_TOKENS, createLayoutTokens } from "@/shared/theme/layout-tokens"
import { afterEach, expect, it, spyOn } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import { createMockDocument } from "../../../../adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { LaneContents } from "./Contents"
import { layoutTrackRows } from "../../core/layout"
import { LaneOverlay } from "../LaneOverlay"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { createManualFrames } from "../testing/frames.test-helper"
import * as clipLabels from "@/project/model/clip-label"
import { CONTROL_METRICS, PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { hitTest } from "../../core/hit-test"

let root: TestRoot | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
})

it("culls offscreen native cards and retains visible node identity while scrolling", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    {
      kind: "pattern",
      id: "first",
      patternId: "p",
      startBar: 1,
      lengthBars: 2,
      label: "First",
      steps: [true, false],
    },
    {
      kind: "pattern",
      id: "second",
      patternId: "p",
      startBar: 5,
      lengthBars: 2,
      label: "Second",
      steps: [false, true],
    },
    {
      kind: "pattern",
      id: "distant",
      patternId: "p",
      startBar: 1000,
      lengthBars: 2,
      steps: [true],
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 1024,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  const row = layoutTrackRows(scene.get())[0]
  if (!row) throw new Error("Missing track row")
  root = createTestRoot({ width: 500, height: 300 })
  const render = () =>
    root?.render(
      <ThemeProvider>
        <div style={{ position: "relative", width: 500, height: 300 }}>
          <div style={{ position: "absolute", top: row.top, width: 500, height: row.height }}>
            <LaneContents
              row={row}
              scene={scene.get()}
              automationMode={false}
              readPeaks={() => new Float32Array(0)}
            />
          </div>
        </div>
      </ThemeProvider>
    )
  render()
  const second = root.renderer.findByTestId("clip-source-second")
  if (!second) throw new Error("Missing visible card")
  expect(root.renderer.findByTestId("clip-source-distant")).toBeUndefined()
  expect(root.renderer.getElementBounds(second.id)?.x).toBe(256)
  scene.setViewport({ ...scene.get().viewport, scrollX: 160 })
  render()
  expect(root.renderer.findByTestId("clip-source-first")).toBeUndefined()
  expect(root.renderer.findByTestId("clip-source-second")?.id).toBe(second.id)
  expect(root.renderer.getElementBounds(second.id)?.x).toBe(96)
})

it("moves a fully visible Clip without reuploading or remounting its unchanged content", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    {
      kind: "pattern",
      id: "local-content",
      patternId: "p",
      startBar: 3,
      lengthBars: 2,
      label: "Local content",
      steps: [true, false, true, false],
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  const row = layoutTrackRows(scene.get())[0]
  if (!row) throw new Error("Missing track row")
  const readPeaks = () => new Float32Array(0)
  root = createTestRoot({ width: 500, height: 300 })
  const render = () =>
    root?.render(
      <ThemeProvider>
        <div style={{ position: "relative", width: 500, height: 300 }}>
          <LaneContents
            row={row}
            scene={scene.get()}
            automationMode={false}
            readPeaks={readPeaks}
          />
        </div>
      </ThemeProvider>
    )
  render()
  const clip = root.renderer.findByTestId("clip-source-local-content")
  if (!clip) throw new Error("Missing Clip")
  const renderer = root.renderer
  const descendants = (id: number): number[] => {
    const element = renderer.getElement(id)
    if (!element) throw new Error(`Missing native content element ${id}`)
    return [id, ...element.children.flatMap(descendants)]
  }
  const contentIds = descendants(clip.id).filter(id => id !== clip.id)
  const batches = new Set(contentIds.filter(id => renderer.getElement(id)?.type === "quad-batch"))
  const uploads = spyOn(renderer, "setQuads")
  try {
    scene.setViewport({ ...scene.get().viewport, scrollX: 64 })
    render()
    expect(renderer.getElementBounds(clip.id)?.x).toBe(64)
    expect(uploads.mock.calls.filter(([id]) => batches.has(id))).toHaveLength(0)
    expect(descendants(clip.id).filter(id => id !== clip.id)).toEqual(contentIds)
  } finally {
    uploads.mockRestore()
  }
})

it("keeps a focused Clip Space-transparent and exposes only the playing transport guide", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    { kind: "pattern", id: "pattern", patternId: "p", startBar: 2, lengthBars: 2, steps: [true] },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  const row = layoutTrackRows(scene.get())[0]
  if (!row) throw new Error("Missing track row")
  scene.setPlayback({ playing: false, insertionPoint: { trackId: track.id, bar: 3 } })
  const received: string[] = []
  let activations = 0
  const frames = createManualFrames()
  let position = 4
  const readPosition = () => position
  root = createTestRoot({
    width: 500,
    height: 300,
    onKeyDown: event => {
      received.push(event.key ?? "")
    },
  })
  const render = () =>
    root?.render(
      <AnimationFrameProvider source={frames}>
        <ThemeProvider>
          <div style={{ position: "relative", width: 500, height: 300 }}>
            <div style={{ position: "absolute", top: row.top, width: 500, height: row.height }}>
              <LaneContents
                row={row}
                scene={scene.get()}
                automationMode={false}
                readPeaks={() => new Float32Array(0)}
              />
            </div>
            <LaneOverlay
              scene={scene.get()}
              viewport={scene.get().viewport}
              transportBar={readPosition}
            />
          </div>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
  render()
  const clip = root.renderer.findByTestId("clip-source-pattern")
  if (!clip) throw new Error("Missing Clip focus target")
  root.renderer.nativeSimulateKeystrokes(clip.id, "space")
  expect(received).toEqual(["space"])
  expect(activations).toBe(0)
  expect(root.renderer.findByTestId("transport-playhead")).toBeUndefined()
  const insertion = root.renderer.findByTestId("insertion-point")
  if (!insertion) throw new Error("Missing stopped insertion")
  expect(root.renderer.getElementBounds(insertion.id)?.x).toBe(128)
  scene.setPlayback({ ...scene.get().playback, playing: true })
  render()
  expect(root.renderer.findByTestId("insertion-point")).toBeUndefined()
  const playhead = root.renderer.findByTestId("transport-playhead")
  if (!playhead) throw new Error("Missing playing transport")
  expect(root.renderer.getElementBounds(playhead.id)?.x).toBe(192)
  position = 5
  flushSync(() => frames.step(16))
  root.renderer.flush()
  expect(root.renderer.getElementBounds(playhead.id)?.x).toBe(256)
})

it("presents the latest playhead on resume and releases frame leases when stopped or unmounted", () => {
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setViewport({ width: 500, height: 300, scrollX: 32, scrollY: 0, pxPerBar: 64, dpr: 1 })
  scene.setPlayback({ playing: true, insertionPoint: null })
  const frames = createManualFrames()
  let position = 3
  const readPosition = () => position
  root = createTestRoot({ width: 500, height: 300 })
  const render = () =>
    root?.render(
      <AnimationFrameProvider source={frames}>
        <ThemeProvider>
          <div style={{ position: "relative", width: 500, height: 300 }}>
            <LaneOverlay
              scene={scene.get()}
              viewport={scene.get().viewport}
              transportBar={readPosition}
            />
          </div>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
  render()
  const playhead = root.renderer.findByTestId("transport-playhead")
  if (!playhead) throw new Error("Missing playing transport")
  expect(root.renderer.getElementBounds(playhead.id)?.x).toBe(96)
  position = 8
  frames.stepResume(500)
  expect(root.renderer.getElementBounds(playhead.id)?.x).toBe(416)
  expect(frames.subscriberCount).toBe(1)
  expect(frames.resumeSubscriberCount).toBe(1)
  scene.setPlayback({ playing: false, insertionPoint: null })
  render()
  expect(root.renderer.findByTestId("transport-playhead")).toBeUndefined()
  expect(frames.subscriberCount).toBe(0)
  expect(frames.resumeSubscriberCount).toBe(0)
  position = 2
  frames.stepResume(600)
  scene.setPlayback({ playing: true, insertionPoint: null })
  render()
  const restarted = root.renderer.findByTestId("transport-playhead")
  if (!restarted) throw new Error("Missing restarted transport")
  expect(root.renderer.getElementBounds(restarted.id)?.x).toBe(32)
  expect(frames.resumeSubscriberCount).toBe(1)
  const renderer = root.renderer
  root.unmount()
  root = undefined
  expect(renderer.getRetainedElementCount()).toBe(0)
  expect(frames.subscriberCount).toBe(0)
  expect(frames.resumeSubscriberCount).toBe(0)
})

it("preserves tiny Clip pixel width when projecting a collapsed group summary", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  const group = score.tracks.find(item => item.kind === "group")
  if (!track || !group) throw new Error("Missing group fixture")
  const lengthBars = 0.001
  track.clips = [
    {
      kind: "pattern",
      id: "tiny",
      patternId: "p",
      startBar: 2,
      lengthBars,
      label: "Tiny",
      steps: [true],
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  const music: Parameters<typeof scene.setMusic>[0] = {
    bars: 1024,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [{ ...group, collapsed: true, childTrackIds: [track.id] }, track],
    markers: [],
    loop: score.transport.loop,
  }
  scene.setMusic(music)
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 8, dpr: 1 })
  root = createTestRoot({ width: 500, height: 300 })
  const render = (trackId: string) => {
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === trackId)
    if (!row) throw new Error("Missing projected row")
    root?.render(
      <ThemeProvider>
        <div style={{ position: "relative", width: 500, height: 300 }}>
          <LaneContents
            row={row}
            scene={scene.get()}
            automationMode={false}
            readPeaks={() => new Float32Array(0)}
          />
        </div>
      </ThemeProvider>
    )
  }
  render(group.id)
  const summary = root.renderer.findByTestId(`group-clip-${track.id}-source-tiny`)
  if (!summary) throw new Error("Missing collapsed summary")
  const summaryBounds = root.renderer.getElementBounds(summary.id)
  scene.setMusic({
    ...music,
    tracks: [{ ...group, collapsed: false, childTrackIds: [track.id] }, track],
  })
  render(track.id)
  const expanded = root.renderer.findByTestId("clip-source-tiny")
  if (!expanded) throw new Error("Missing expanded tiny Clip")
  const expandedBounds = root.renderer.getElementBounds(expanded.id)
  expect(summaryBounds?.x).toBe(expandedBounds?.x)
  expect(summaryBounds?.width).toBe(expandedBounds?.width)
  expect(summaryBounds?.width).toBeGreaterThan(lengthBars * scene.get().viewport.pxPerBar)
})

it("scrolls an already-visible unchanged Clip without rerendering its content", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    {
      kind: "pattern",
      id: "stable",
      patternId: "p",
      startBar: 2,
      lengthBars: 4,
      label: "Stable Clip",
      steps: [true, false],
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  const label = spyOn(clipLabels, "clipLabel")
  const readPeaks = () => new Float32Array(0)
  root = createTestRoot({ width: 500, height: 300 })
  const paint = () => {
    const row = layoutTrackRows(scene.get())[0]
    if (!row) throw new Error("Missing visible row")
    root?.render(
      <ThemeProvider>
        <div style={{ position: "relative", width: 500, height: 300 }}>
          <div style={{ position: "absolute", top: row.top, width: 500, height: row.height }}>
            <LaneContents
              row={row}
              scene={scene.get()}
              automationMode={false}
              readPeaks={readPeaks}
            />
          </div>
        </div>
      </ThemeProvider>
    )
  }
  try {
    paint()
    const clip = root.renderer.findByTestId("clip-source-stable")
    const before = clip && root.renderer.getElementBounds(clip.id)
    if (!clip || !before) throw new Error("Missing visible Clip")
    if (!label.mock.calls.some(([item]) => item.id === "stable"))
      throw new Error("Label instrumentation did not observe the initial Clip render")
    label.mockClear()
    scene.setViewport({ ...scene.get().viewport, scrollY: 16 })
    paint()
    expect(root.renderer.findByTestId("clip-source-stable")?.id).toBe(clip.id)
    expect(root.renderer.getElementBounds(clip.id)?.y).toBe(before.y - 16)
    expect(label.mock.calls.filter(([item]) => item.id === "stable")).toHaveLength(0)
  } finally {
    label.mockRestore()
  }
})

it("refreshes a cached mounted Clip title when density changes without changing track height", () => {
  const score = createMockDocument()
  const owner = score.tracks.find(track => track.kind === "audio")
  if (!owner) throw new Error("Missing audio track")
  const track = { ...owner, collapsed: false, heightPx: 70 }
  track.clips = [
    {
      kind: "audio",
      id: "density-clip",
      label: "Density clip",
      startBar: 1,
      lengthBars: 2,
      samplePath: "unloaded.wav",
      gainDb: 0,
    },
  ]
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: score.transport,
    tracks: [track],
    markers: [],
    loop: score.transport.loop,
  })
  scene.setViewport({ width: 500, height: 200, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  // Fixed offscreen viewport isolates the visible title/body boundary, not a product layout default.
  const mounted = createTestRoot({ width: 500, height: 200 })
  root = mounted
  const readPeaks = () => new Float32Array(0)
  const show = (control: typeof CONTROL_METRICS.default, layout = DEFAULT_LAYOUT_TOKENS) => {
    scene.setGeometry(layout)
    const row = layoutTrackRows(scene.get())[0]
    if (!row) throw new Error("Missing density row")
    mounted.render(
      <ThemeProvider control={control} layout={layout}>
        <div style={{ position: "relative", width: 500, height: 200 }}>
          <LaneContents
            row={row}
            scene={scene.get()}
            automationMode={false}
            readPeaks={readPeaks}
          />
        </div>
      </ThemeProvider>
    )
    return row
  }
  const titleBounds = () => {
    const card = mounted.renderer.findByTestId("clip-source-density-clip")
    const label = card?.children.find(id => mounted.renderer.getElement(id)?.type === "text")
    const bounds = label === undefined ? undefined : mounted.renderer.getElementBounds(label)
    if (!card || !bounds) throw new Error("Missing native Clip label bounds")
    return { cardId: card.id, ...bounds }
  }
  const original = show(CONTROL_METRICS.default)
  const before = titleBounds()
  expect(before.height).toBe(21)
  expect(hitTest(scene.get(), 32, original.top + 25)?.kind).toBe("clip-body")
  const control = {
    ...CONTROL_METRICS.default,
    "--spacing-control-track": 20,
    "--spacing-control-track-gap": 6,
  }
  const updated = show(control, createLayoutTokens(control, PROJECT_METRICS))
  expect(updated.height).toBe(original.height)
  expect(hitTest(scene.get(), 32, updated.top + 25)?.kind).toBe("clip-title")
  expect(titleBounds().cardId).toBe(before.cardId)
  expect(titleBounds().height).toBe(32)
})
