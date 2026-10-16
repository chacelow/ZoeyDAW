import { afterEach, beforeEach, expect, it, spyOn } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createMockDocument, TEST_CREATION_NAMES } from "@/project/adapters/fixtures"
import { useProjectState } from "@/project/adapters"
import { useProjectState as projectStore } from "@/project/stores/useProjectState"
import { AnimationFrameProvider } from "@/platform/frame"
import { createSceneStore } from "../core/scene"
import { layoutTrackRows } from "../core/layout"
import { activeAutomationRows, automationY } from "../core/automation/geometry"
import { LaneContents } from "./LaneRow/Contents"
import { LaneOverlay } from "./LaneOverlay"
import { createManualFrames } from "./testing/frames.test-helper"

let root: TestRoot | undefined
let savedState = useProjectState.getState()
beforeEach(() => {
  savedState = useProjectState.getState()
})
afterEach(() => {
  root?.unmount()
  root = undefined
  projectStore.setState(savedState, true)
})

const design = {
  ...DEFAULT_DESIGN_TOKENS,
  editor: {
    ...DEFAULT_DESIGN_TOKENS.editor,
    clipGhostOpacity: 0.61,
    rangeOpacity: 0.62,
    groupClipPreviewOpacity: 0.63,
    drawPreviewOpacity: 0.64,
    clipBodySelectedOpacity: 0.72,
    clipBodyAutomationOpacity: 0.73,
    clipBodyOpacity: 0.74,
    clipGridHoveredOpacity: 0.75,
    clipGridOpacity: 0.76,
    clipAutomationPreviewOpacity: 0.77,
    fadeStrokeWidth: 2,
    clipLoopShadeOpacity: 0.65,
    loopLineWidth: 3,
    insertionLineWidth: 4,
    playheadLineWidth: 5,
    selectionLineWidth: 6,
    gridMinorStrokeWidth: 2,
  },
}
const project = {
  ...PROJECT_METRICS,
  gridMinorOpacity: 0.71,
  arrangementGridMajorLineWidth: 3,
  arrangementFadeHandleSize: 9,
}
const layout = {
  ...DEFAULT_LAYOUT_TOKENS,
  arrangement: {
    ...DEFAULT_LAYOUT_TOKENS.arrangement,
    barRulerHeight: 47,
    timeRulerHeight: 23,
    automationPointRadius: 9,
  },
}

function fixture() {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "midi")
  const group = document.tracks.find(item => item.kind === "group")
  if (!track || !group) throw new Error("Missing lane fixtures")
  track.clips = [
    {
      kind: "pattern",
      id: "pattern",
      patternId: "p",
      startBar: 2,
      lengthBars: 4,
      steps: Array.from({ length: 16 }, (_, index) => index === 0),
    },
  ]
  const scene = createSceneStore(layout)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: document.transport,
    tracks: [track],
    markers: [],
    loop: document.transport.loop,
  })
  scene.setViewport({ width: 500, height: 300, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
  const currentRoot = createTestRoot({ width: 500, height: 300 })
  root = currentRoot
  const renderer = currentRoot.renderer
  const row = () => {
    const result = layoutTrackRows(scene.get())[0]
    if (!result) throw new Error("Missing lane row")
    return result
  }
  const paint = (automationMode = false) =>
    currentRoot.render(
      <ThemeProvider design={design} layout={layout} project={project}>
        <div style={{ position: "relative", width: 500, height: 300 }}>
          <LaneContents
            creationNames={TEST_CREATION_NAMES}
            row={row()}
            scene={scene.get()}
            automationMode={automationMode}
            readPeaks={() => new Float32Array(0)}
          />
        </div>
      </ThemeProvider>
    )
  const element = (testId: string) => {
    const result = renderer.findByTestId(testId)
    if (!result) throw new Error(`Missing ${testId}`)
    return result
  }
  const children = (id: number) => {
    const parent = renderer.getElement(id)
    if (!parent) throw new Error(`Missing native element ${id}`)
    return parent.children.map(child => {
      const result = renderer.getElement(child)
      if (!result) throw new Error(`Missing native child ${child}`)
      return result
    })
  }
  return { document, track, group, scene, row, paint, renderer, element, children }
}

it("renders ghost, selection, draw and minor-grid overrides at the native lane consumers", () => {
  const f = fixture()
  f.scene.setTrackSelection(new Set([f.track.id]))
  f.scene.setTimeSelection({ startBar: 2, endBar: 4, trackIds: [f.track.id] })
  f.scene.setClipDrag({ source: [f.track], ids: new Set(["pattern"]) })
  const uploads = spyOn(f.renderer, "setQuads")
  try {
    f.paint()
    expect(f.element("clip-ghost-pattern").style.opacity).toBe(0.61)
    const layers = f.children(f.element(`lane-row-content-${f.track.id}`).id)
    expect(layers.some(layer => layer.style.opacity === 0.62)).toBe(true)
    expect(layers.some(layer => layer.style.opacity === 0.64)).toBe(true)
    const minor = layers.find(layer => layer.type === "quad-batch" && layer.style.opacity === 0.71)
    const major = layers.find(layer => layer.type === "quad-batch" && layer.style.opacity === 1)
    if (!minor || !major) throw new Error("Missing native grid batches")
    const minorQuads = uploads.mock.calls.find(([id]) => id === minor.id)?.[1]
    const majorQuads = uploads.mock.calls.find(([id]) => id === major.id)?.[1]
    if (!minorQuads?.length || !majorQuads?.length) throw new Error("Grid did not upload")
    for (let index = 2; index < minorQuads.length; index += 4) expect(minorQuads[index]).toBe(2)
    for (let index = 2; index < majorQuads.length; index += 4) expect(majorQuads[index]).toBe(3)
  } finally {
    uploads.mockRestore()
  }
})

it("renders collapsed group summaries with their own opacity override", () => {
  const f = fixture()
  f.scene.setMusic({
    ...f.scene.get(),
    tracks: [{ ...f.group, collapsed: true, childTrackIds: [f.track.id] }, f.track],
  })
  f.paint()
  expect(f.element(`group-clip-${f.track.id}-source-pattern`).style.opacity).toBe(0.63)
})

it("renders clip loop width and hovered shade from independent overrides", () => {
  const f = fixture()
  f.scene.setHover({ id: "pattern", region: "body" })
  f.paint()
  const layers = f.children(f.element("clip-source-pattern").id)
  const ticks = layers.filter(
    layer =>
      layer.style.height === project.arrangementLoopTickHeight &&
      layer.style.top === 0 &&
      layer.style.width === 3
  )
  expect(ticks.length).toBeGreaterThan(0)
  expect(layers.some(layer => layer.style.opacity === 0.65)).toBe(true)
})

it("renders insertion, playhead and alignment widths and injected ruler bounds", () => {
  const f = fixture()
  const frames = createManualFrames()
  const paint = () =>
    root?.render(
      <ThemeProvider design={design} layout={layout}>
        <AnimationFrameProvider source={frames}>
          <LaneOverlay
            scene={f.scene.get()}
            viewport={f.scene.get().viewport}
            transportBar={() => 3}
          />
        </AnimationFrameProvider>
      </ThemeProvider>
    )
  f.scene.setPlayback({ playing: false, insertionPoint: { trackId: f.track.id, bar: 2 } })
  f.scene.setClipResize({ id: "pattern", edge: "right" })
  paint()
  expect(f.element("insertion-point").style.width).toBe(4)
  expect(f.element("clip-alignment").style.width).toBe(6)
  expect(f.renderer.getElementBounds(f.element("clip-alignment").id)?.y).toBe(47)
  f.scene.setMusic({ ...f.scene.get(), tracks: [{ ...f.track, heightPx: 500 }] })
  paint()
  expect(f.renderer.getElementBounds(f.element("insertion-point").id)).toMatchObject({
    y: 47,
    height: 230,
  })
  f.scene.setPlayback({ playing: true, insertionPoint: null })
  paint()
  const playhead = f.element("transport-playhead")
  expect(playhead.style.width).toBe(5)
  expect(f.renderer.getElementBounds(playhead.id)).toMatchObject({ y: 47, height: 230 })
})

it("uses injected automation radius for selected points and viewport-edge culling", () => {
  const f = fixture()
  f.track.automation = [
    {
      id: "volume",
      parameter: "volume",
      points: [
        { id: "selected", bar: 2, value: 0.5 },
        { id: "edge", bar: 1 - 6 / 64, value: 0.6 },
      ],
    },
  ]
  f.scene.setMusic({ ...f.scene.get(), tracks: [{ ...f.track }] })
  f.scene.setAutomationParameters({ [f.track.id]: "volume" })
  const row = activeAutomationRows(f.scene.get())[0]
  if (!row) throw new Error("Missing automation row")
  f.scene.setTargetSelection({
    kind: "automation",
    trackId: f.track.id,
    laneId: row.laneId,
    pointIds: ["selected"],
  })
  f.paint(true)
  const point = f.element("automation-point-selected")
  expect(point.style.width).toBe(18)
  expect(point.style.height).toBe(18)
  expect(point.style.borderRadius).toBe(9)
  expect(point.style.left).toBe(55)
  expect(point.style.top).toBe(automationY(row, 0.5) - row.top - 9)
  expect(f.renderer.findByTestId("automation-point-edge")).toBeDefined()
})

it("updates retained clip fade geometry when injected hit size and margin change", () => {
  const f = fixture()
  const audio = f.document.tracks.find(track => track.kind === "audio")
  if (!audio) throw new Error("Missing audio fixture")
  audio.clips = [
    {
      kind: "audio",
      id: "fade",
      startBar: 2,
      lengthBars: 4,
      samplePath: "fixture.wav",
      gainDb: 0,
      fadeInBars: 0.25,
      fadeOutBars: 0.25,
    },
  ]
  f.scene.setMusic({ ...f.scene.get(), tracks: [audio] })
  f.scene.setHover({ id: "fade", region: "body" })
  f.paint()
  const peak = f.element("fade-fade-in-quiet")
  expect(f.renderer.findByTestId("fade-fade-in-curve")).toBeDefined()
  expect(peak.style.borderWidth).toBe(2)
  expect(peak.style.width).toBe(9)
  expect(peak.style.height).toBe(9)
  const clipLayers = f.children(f.element("clip-source-fade").id)
  const curveStroke = clipLayers.find(layer => layer.type === "svg")
  expect(curveStroke?.customProps?.source).toContain('stroke-width="2"')
  const curveHandle = f.element("fade-fade-in-curve")
  const diamondShapes = f.children(curveHandle.id)
  expect(diamondShapes[1]?.customProps?.source).toContain('stroke-width="2"')
  expect(diamondShapes[0]?.customProps?.source).toContain("4.5,1")
  f.scene.setGeometry({
    ...layout,
    arrangement: {
      ...layout.arrangement,
      clip: { ...layout.arrangement.clip, fadeHandleMargin: 11 },
      hit: { ...layout.arrangement.hit, clipFadeHandle: 20 },
    },
  })
  f.paint()
  expect(f.renderer.findByTestId("fade-fade-in-curve")).toBeUndefined()
  expect(f.element("fade-fade-in-quiet").style.left).toBe(6.5)
  const retainedGeometry = f.scene.get().geometry
  f.scene.setGeometry({
    ...retainedGeometry,
    track: { ...retainedGeometry.track, titleHeight: 33 },
  })
  f.paint()
  expect(f.children(f.element("clip-source-fade").id)[0]?.style.height).toBe(33)
})

it.each([
  { selected: false, hovered: false, automation: false, bodyOpacity: 0.74, gridOpacity: 0.76 },
  { selected: true, hovered: false, automation: false, bodyOpacity: 0.72, gridOpacity: 0.76 },
  { selected: false, hovered: true, automation: false, bodyOpacity: 0.74, gridOpacity: 0.75 },
  { selected: false, hovered: false, automation: true, bodyOpacity: 0.73, gridOpacity: 0.76 },
])("renders independent clip body/grid paint overrides: %j", state => {
  const f = fixture()
  if (state.selected) f.scene.setSelection(new Set(["pattern"]))
  if (state.hovered) f.scene.setHover({ id: "pattern", region: "body" })
  f.paint(state.automation)
  const layers = f.children(f.element("clip-source-pattern").id)
  expect(
    layers.some(layer => layer.type === "div" && layer.style.opacity === state.bodyOpacity)
  ).toBe(true)
  expect(
    layers.some(layer => layer.type === "quad-batch" && layer.style.opacity === state.gridOpacity)
  ).toBe(true)
  if (state.automation) {
    expect(layers.some(layer => layer.type === "quad-batch" && layer.style.opacity === 0.77)).toBe(
      true
    )
  }
})

it("renders the same automation preview opacity for native audio waveforms", () => {
  const f = fixture()
  const audio = f.document.tracks.find(track => track.kind === "audio")
  if (!audio) throw new Error("Missing audio fixture")
  audio.clips = [
    {
      kind: "audio",
      id: "waveform",
      startBar: 2,
      lengthBars: 4,
      samplePath: "fixture.wav",
      gainDb: 0,
    },
  ]
  f.scene.setMusic({ ...f.scene.get(), tracks: [audio] })
  root?.render(
    <ThemeProvider design={design} layout={layout} project={project}>
      <div style={{ position: "relative", width: 500, height: 300 }}>
        <LaneContents
          creationNames={TEST_CREATION_NAMES}
          row={f.row()}
          scene={f.scene.get()}
          automationMode
          readPeaks={(_source, _start, _end, pixels) => new Float32Array(pixels * 2).fill(0.4)}
        />
      </div>
    </ThemeProvider>
  )
  const layers = f.children(f.element("clip-source-waveform").id)
  expect(layers.some(layer => layer.style.opacity === 0.77)).toBe(true)
})
