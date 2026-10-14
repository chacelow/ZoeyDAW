import { afterEach, expect, it } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import { createMockDocument } from "../../../../adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { LaneContents } from "./Contents"
import { layoutTrackRows } from "../../core/layout"
import { PlayheadLayer } from "../PlayheadLayer"

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
  const scene = createSceneStore()
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
              onActivate={() => {}}
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

it("keeps a focused Clip Space-transparent and exposes only the playing transport guide", () => {
  const score = createMockDocument()
  const track = score.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    { kind: "pattern", id: "pattern", patternId: "p", startBar: 2, lengthBars: 2, steps: [true] },
  ]
  const scene = createSceneStore()
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
  root = createTestRoot({
    width: 500,
    height: 300,
    onKeyDown: event => {
      received.push(event.key ?? "")
    },
  })
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
              onActivate={() => {
                activations++
              }}
            />
          </div>
          <PlayheadLayer scene={scene.get()} transportBar={4} />
        </div>
      </ThemeProvider>
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
})
