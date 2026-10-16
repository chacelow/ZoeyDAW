import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { afterEach, beforeEach, expect, it } from "bun:test"
import { useMemo, useSyncExternalStore } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import type { NativeClipboard } from "../../../../../platform/clipboard"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
} from "../../../../adapters"
import { useProjectState as projectStore } from "@/project/stores/useProjectState"
import { createMockDocument, createMockWorkspace } from "../../../../adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import type { SceneStore } from "../../core/scene"
import { clipRect, layoutTrackRows } from "../../core/layout"
import { clipVisualGeometry } from "../../core/clip-geometry"
import { activeAutomationRows, automationY } from "../../core/automation/geometry"
import { LaneRow } from "../LaneRow"
import { LaneOverlay } from "../LaneOverlay"
import { visibleRows } from "../render-projection"
import { labelsByLocale } from "../demo/labels"
import { createLaneController } from "./controller"
import type { LaneController } from "./controller"
import { createTestTimeline } from "../testing/project-scene.test-helper"
import { AnimationFrameProvider } from "@/platform/frame"
import { createManualFrames } from "../testing/frames.test-helper"
import { useLaneSurface } from "../useLaneSurface"

const overriddenDesign: DesignTokens = {
  ...DEFAULT_DESIGN_TOKENS,
  editor: { ...DEFAULT_DESIGN_TOKENS.editor, inlineRadius: 7 },
  spacing: { ...DEFAULT_DESIGN_TOKENS.spacing, stackGap: 11 },
  cursors: {
    ...DEFAULT_DESIGN_TOKENS.cursors,
    default: "grab",
    grab: "ew-resize",
    grabbing: "crosshair",
    disabled: "ns-resize",
    horizontalResize: "grabbing",
    fadeCurve: "not-allowed",
    automationDraw: "move",
    verticalResize: "default",
  },
}
let savedState = useProjectState.getState()
beforeEach(() => {
  savedState = useProjectState.getState()
})
let root: TestRoot | undefined
let controller: LaneController | undefined
let releaseTimeline: (() => void) | undefined
afterEach(() => {
  root?.unmount()
  controller?.dispose()
  releaseTimeline?.()
  root = undefined
  controller = undefined
  releaseTimeline = undefined
  projectStore.setState(savedState, true)
})

function Surface({ scene, controller }: { scene: SceneStore; controller: LaneController }) {
  const snapshot = useSyncExternalStore(scene.subscribe, scene.get)
  const frames = useMemo(createManualFrames, [])
  const { wrap, ...editSurface } = useLaneSurface(controller, labelsByLocale.en, 0)
  return (
    <AnimationFrameProvider source={frames}>
      <div style={{ position: "relative", width: 1000, height: 500 }}>
        {visibleRows(snapshot).map(row => (
          <div
            key={row.track.id}
            style={{
              position: "absolute",
              left: 0,
              top: row.clipTop,
              width: 1000,
              height: row.clipBottom - row.clipTop,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: row.top - row.clipTop,
                width: 1000,
                height: row.height,
              }}
            >
              <LaneRow
                row={row}
                scene={snapshot}
                viewport={snapshot.viewport}
                readPeaks={() => new Float32Array(0)}
              />
            </div>
          </div>
        ))}
        <LaneOverlay
          scene={snapshot}
          viewport={snapshot.viewport}
          transportBar={() => useProjectState.getState().session.position.bar}
        />
        {wrap(
          <div
            {...editSurface}
            testId="lane-surface"
            role="application"
            tabIndex={0}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 1000,
              height: 500,
              cursor: editSurface.style.cursor,
            }}
          />
        )}
      </div>
    </AnimationFrameProvider>
  )
}

function mount(options: { automation?: boolean; audio?: boolean; design?: DesignTokens } = {}) {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "midi")
  const main = document.tracks.find(item => item.kind === "main")
  const audio = document.tracks.find(item => item.kind === "audio")
  if (!track || !main || !audio) throw new Error("Missing project fixtures")
  track.id = "source"
  track.output = "main"
  track.clips = [
    {
      kind: "pattern",
      id: "pattern",
      patternId: "p",
      startBar: 2,
      lengthBars: 4,
      steps: [true, false, true, false],
    },
  ]
  track.automation = [
    {
      id: "source-volume",
      parameter: "volume",
      points: [
        { id: "a", bar: 2.5, value: 0.5 },
        { id: "b", bar: 5, value: 0.8 },
        { id: "outside", bar: 20, value: 0.1 },
      ],
    },
  ]
  const target = {
    ...structuredClone(track),
    id: "target",
    name: "Target",
    clips: [],
    automation: [],
  }
  audio.id = "audio"
  audio.output = "main"
  audio.clips = [
    {
      kind: "audio",
      id: "audio-clip",
      startBar: 2,
      lengthBars: 4,
      samplePath: "fixture.wav",
      sourceOffsetBars: 0,
      gainDb: 0,
      fadeInBars: 1,
      fadeOutBars: 1,
    },
  ]
  document.tracks = [track, target, ...(options.audio ? [audio] : []), main]
  const workspace = createMockWorkspace()
  workspace.pxPerBar = 64
  workspace.scrollX = 0
  workspace.scrollY = 0
  workspace.grid = { mode: "fixed", bars: 0.25 }
  workspace.automationMode = options.automation ?? false
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  const clipboardState = { value: "" }
  const clipboard: NativeClipboard = {
    readText: () => clipboardState.value,
    writeText: value => {
      clipboardState.value = value
    },
  }
  const timeline = createTestTimeline(scene, 1000, 500)
  releaseTimeline = timeline.dispose
  const current = createLaneController({
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
    clipboard,
    edgePixels: 42,
    setScroll: timeline.setScroll,
  })
  controller = current
  const windowKeys: string[] = []
  const currentRoot = createTestRoot({
    width: 1000,
    height: 500,
    onKeyDown: event => {
      windowKeys.push(event.key ?? "")
      if (event.key === "space") projectActions.togglePlay()
    },
  })
  root = currentRoot
  currentRoot.render(
    <ThemeProvider design={options.design}>
      <Surface scene={scene} controller={current} />
    </ThemeProvider>
  )
  const sourceRow = layoutTrackRows(scene.get()).find(row => row.track.id === "source")
  const targetRow = layoutTrackRows(scene.get()).find(row => row.track.id === "target")
  const host = currentRoot.renderer.findByTestId("lane-surface")
  if (!sourceRow || !targetRow || !host) throw new Error("Missing lane geometry")
  return {
    root: currentRoot,
    renderer: currentRoot.renderer,
    scene,
    controller: current,
    sourceRow,
    targetRow,
    host: host.id,
    clipboard,
    clipboardState,
    windowKeys,
  }
}

it("keeps a live time-range preview across snap updates and restores committed selection on cancel", () => {
  const { renderer, scene, sourceRow, host } = mount()
  const previous = { startBar: 8, endBar: 9, trackIds: ["source"] }
  projectActions.setTimeSelection(previous)
  renderer.nativeSimulateMouseDown(400, sourceRow.top + 40)
  renderer.nativeSimulateMouseMove(528, sourceRow.top + 40, 0)
  const preview = { startBar: 7.25, endBar: 9.25, trackIds: ["source"] }
  expect(scene.get().timeSelection).toEqual(preview)
  expect(useProjectState.getState().session.timeSelection).toEqual(previous)
  projectActions.setSnap(false)
  expect(scene.get().timeSelection).toEqual(preview)
  renderer.nativeSimulateKeystrokes(host, "escape")
  expect(scene.get().timeSelection).toEqual(previous)
  renderer.nativeSimulateMouseDown(400, sourceRow.top + 40)
  renderer.nativeSimulateMouseMove(528, sourceRow.top + 40, 0)
  renderer.nativeSimulateMouseUp(528, sourceRow.top + 40)
  expect(scene.get().timeSelection).toEqual(useProjectState.getState().session.timeSelection)
  expect(scene.get().timeSelection).toEqual(preview)
})

it("clears invalidated time-range preview without overwriting the hydrated project selection", () => {
  const { renderer, scene, sourceRow } = mount()
  renderer.nativeSimulateMouseDown(400, sourceRow.top + 40)
  renderer.nativeSimulateMouseMove(528, sourceRow.top + 40, 0)
  expect(scene.get().timeSelection).toEqual({ startBar: 7.25, endBar: 9.25, trackIds: ["source"] })
  hydrateProject(serializeProject())
  const selection = { startBar: 12, endBar: 14, trackIds: ["target"] }
  projectActions.setTimeSelection(selection)
  renderer.nativeSimulateMouseUp(528, sourceRow.top + 40)
  expect(scene.get().timeSelection).toEqual(selection)
  expect(scene.get().timeSelectionPreview).toBeNull()
  expect(useProjectState.getState().session.timeSelection).toEqual(selection)
  expect(useProjectState.getState().session.insertionPoint).toBeNull()
})

it.each(["move", "resize"])(
  "clears stale %s ink after hydrate without editing the replacement project",
  kind => {
    const { renderer, scene, sourceRow } = mount()
    const x = kind === "move" ? 100 : 318
    renderer.nativeSimulateMouseDown(x, sourceRow.top + 6)
    renderer.nativeSimulateMouseMove(x + 128, sourceRow.top + 6, 0)
    expect(kind === "move" ? scene.get().clipDrag : scene.get().clipResize).not.toBeNull()
    const saved = serializeProject()
    hydrateProject(saved)
    const document = useProjectState.getState().document
    renderer.nativeSimulateMouseUp(x + 128, sourceRow.top + 6)
    expect(scene.get().clipDrag).toBeNull()
    expect(scene.get().clipResize).toBeNull()
    expect(renderer.findByTestId("clip-ghost-pattern")).toBeUndefined()
    expect(useProjectState.getState().document).toEqual(document)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  }
)

it.each([false, true])(
  "rejects an invalid release after a valid cross-track preview (copy=%s)",
  copy => {
    const { scene, controller, sourceRow, targetRow } = mount({ audio: true })
    const before = useProjectState.getState().document
    const pointer = (x: number, y: number) => ({
      x,
      y,
      button: 0,
      shiftKey: false,
      altKey: copy,
      metaKey: false,
      ctrlKey: false,
    })
    controller.pointerDown(pointer(100, sourceRow.top + 6))
    controller.pointerMove(pointer(228, targetRow.top + 6), true)
    expect(scene.get().tracks.find(track => track.id === "target")?.clips[0]?.startBar).toBe(4)
    const selection = useProjectState.getState().session.selectedClipIds
    const insertion = useProjectState.getState().session.insertionPoint
    const audioRow = layoutTrackRows(scene.get()).find(row => row.track.id === "audio")
    if (!audioRow) throw new Error("Missing audio target")
    controller.pointerMove(pointer(228, audioRow.top + 6), true)
    expect(controller.getSnapshot().cursor).toBe("disabled")
    controller.pointerUp(pointer(228, audioRow.top + 6))
    expect(useProjectState.getState().document).toEqual(before)
    expect(useProjectState.getState().session.selectedClipIds).toEqual(selection)
    expect(useProjectState.getState().session.insertionPoint).toEqual(insertion)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    expect(scene.get().clipDrag).toBeNull()
  }
)

it("keeps sub-threshold presses inert and rolls a native Ghost drag back on Escape", () => {
  const { renderer, scene, sourceRow, host } = mount()
  renderer.nativeSimulateMouseDown(100, sourceRow.top + 6)
  renderer.nativeSimulateMouseMove(102, sourceRow.top + 6, 0)
  expect(scene.get().clipDrag).toBeNull()
  renderer.nativeSimulateMouseMove(228, sourceRow.top + 6, 0)
  expect(scene.get().tracks[0]?.clips[0]?.startBar).toBe(4)
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
  expect(renderer.findByTestId("clip-ghost-pattern")).toBeDefined()
  renderer.nativeSimulateKeystrokes(host, "escape")
  expect(renderer.findByTestId("clip-ghost-pattern")).toBeUndefined()
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("moves all automation within the Clip interval across tracks in Automation mode", () => {
  const { renderer, scene, sourceRow, targetRow } = mount({ automation: true })
  renderer.nativeSimulateMouseDown(100, sourceRow.top + 6)
  renderer.nativeSimulateMouseMove(228, targetRow.top + 6, 0)
  expect(scene.get().tracks.find(track => track.id === "source")?.clips).toEqual([])
  renderer.nativeSimulateMouseUp(228, targetRow.top + 6)
  const state = useProjectState.getState()
  expect(state.document.tracks[0]?.automation[0]?.points.map(point => point.bar)).toEqual([20])
  expect(state.document.tracks[1]?.clips[0]?.startBar).toBe(4)
  expect(
    state.document.tracks[1]?.automation[0]?.points.map(point => [point.bar, point.value])
  ).toEqual([
    [4.5, 0.5],
    [7, 0.8],
  ])
  projectActions.undo()
  expect(
    useProjectState.getState().document.tracks[0]?.automation[0]?.points.map(point => point.bar)
  ).toEqual([2.5, 5, 20])
  expect(useProjectState.getState().document.tracks[1]?.clips).toEqual([])
})

it("splits at the stationary insertion anchor during playback and does nothing without selection", () => {
  const { renderer, host, windowKeys } = mount()
  projectActions.selectClips(["pattern"])
  projectActions.setPosition({ bar: 5, beat: 1, sixteenth: 1 })
  projectActions.togglePlay()
  projectActions.setInsertionPoint({ trackId: "source", bar: 3 })
  renderer.nativeSimulateKeystrokes(host, "cmd-e")
  expect(
    useProjectState
      .getState()
      .document.tracks[0]?.clips.map(clip => [clip.startBar, clip.lengthBars])
  ).toEqual([
    [2, 1],
    [3, 3],
  ])
  expect(windowKeys.includes("e")).toBe(false)
  projectActions.undo()
  projectActions.selectClips([])
  renderer.nativeSimulateKeystrokes(host, "cmd-e")
  expect(
    useProjectState
      .getState()
      .document.tracks[0]?.clips.map(clip => [clip.startBar, clip.lengthBars])
  ).toEqual([[2, 4]])
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("uses current native clipboard text and leaves Clips intact when writing the clipboard fails", () => {
  const { renderer, host, sourceRow, controller, clipboardState, clipboard } = mount()
  renderer.nativeSimulateClick(100, sourceRow.top + 6)
  renderer.nativeSimulateKeystrokes(host, "cmd-c")
  const copied = clipboardState.value
  clipboardState.value = "unrelated external text"
  renderer.nativeSimulateKeystrokes(host, "cmd-v")
  expect(useProjectState.getState().document.tracks[0]?.clips.map(clip => clip.startBar)).toEqual([
    2,
  ])
  clipboardState.value = copied
  renderer.nativeSimulateClick(448, sourceRow.top + 30)
  renderer.nativeSimulateKeystrokes(host, "cmd-v")
  expect(useProjectState.getState().document.tracks[0]?.clips.map(clip => clip.startBar)).toEqual([
    2, 8,
  ])
  clipboard.writeText = () => {
    throw new Error("Clipboard unavailable")
  }
  expect(() => controller.clipboard("cut")).toThrow("Clipboard unavailable")
  expect(useProjectState.getState().document.tracks[0]?.clips.map(clip => clip.startBar)).toEqual([
    2, 8,
  ])
})

it("commits and cancels inline names without leaking editor keys or requesting Clip View", () => {
  const { renderer, host, sourceRow, windowKeys } = mount()
  const request = useProjectState.getState().session.clipEditorRequest
  renderer.nativeSimulateClick(100, sourceRow.top + 6)
  renderer.nativeSimulateKeystrokes(host, "cmd-r")
  const editor = renderer.findByTestId("clip-name-editor")
  if (!editor) throw new Error("Rename editor not mounted")
  expect(renderer.getFocusedElementId()).toBe(editor.id)
  const keysBefore = [...windowKeys]
  renderer.simulateKeystrokes("n e w space enter")
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.label).toBe("new")
  expect(windowKeys).toEqual(keysBefore)
  expect(useProjectState.getState().session.clipEditorRequest).toBe(request)
  renderer.nativeSimulateKeystrokes(host, "cmd-r")
  renderer.simulateKeystrokes("b a d escape")
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.label).toBe("new")
  expect(useProjectState.getState().session.clipEditorRequest).toBe(request)
})

it("keeps saturated fade previews on release and moves both fade endpoints when trimming", () => {
  const { renderer, scene } = mount({ audio: true })
  const row = layoutTrackRows(scene.get()).find(row => row.track.id === "audio")
  const clip = row?.track.clips[0]
  if (!row || clip?.kind !== "audio") throw new Error("Missing audio Clip")
  const geometry = clipVisualGeometry(clipRect(clip, row, 64, 0), clip, row.track, true)
  const fade = geometry.fades[0]
  if (!fade) throw new Error("Missing fade geometry")
  renderer.nativeSimulateMouseMove(200, geometry.bodyTop + 20)
  renderer.nativeSimulateMouseDown(fade.end.x, fade.end.y + 1)
  renderer.nativeSimulateMouseMove(400, fade.end.y + 1, 0)
  const preview = scene.get().tracks.find(track => track.id === "audio")?.clips[0]
  expect(preview?.kind === "audio" && preview.fadeInBars).toBe(3)
  renderer.nativeSimulateMouseUp(400, fade.end.y + 1)
  const committed = useProjectState.getState().document.tracks.find(track => track.id === "audio")
    ?.clips[0]
  expect(committed?.kind === "audio" && committed.fadeInBars).toBe(3)
  projectActions.undo()
  renderer.nativeSimulateMouseMove(200, geometry.bodyTop + 20)
  const peak = renderer.findByTestId("fade-audio-clip-in-peak")
  const quiet = renderer.findByTestId("fade-audio-clip-in-quiet")
  if (!peak || !quiet) throw new Error("Missing native fade handles")
  const peakBefore = renderer.getElementBounds(peak.id)
  const quietBefore = renderer.getElementBounds(quiet.id)
  if (!peakBefore || !quietBefore) throw new Error("Unpainted fade handles")
  renderer.nativeSimulateMouseMove(64, row.top + 6)
  renderer.nativeSimulateMouseDown(64, row.top + 6)
  renderer.nativeSimulateMouseMove(96, row.top + 6, 0)
  renderer.nativeSimulateMouseUp(96, row.top + 6)
  renderer.nativeSimulateMouseMove(200, geometry.bodyTop + 20)
  const nextPeak = renderer.findByTestId("fade-audio-clip-in-peak")
  const nextQuiet = renderer.findByTestId("fade-audio-clip-in-quiet")
  if (!nextPeak || !nextQuiet) throw new Error("Missing restored fade handles")
  const peakAfter = renderer.getElementBounds(nextPeak.id)
  const quietAfter = renderer.getElementBounds(nextQuiet.id)
  expect(peakAfter?.x).toBeCloseTo(peakBefore.x + 32)
  expect(quietAfter?.x).toBeCloseTo(quietBefore.x + 32)
})

it("advances edge autoscroll from elapsed native frame time and rejects disposed input", () => {
  const { controller, sourceRow, scene } = mount()
  const pointer = {
    x: 100,
    y: sourceRow.top + 6,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  controller.pointerDown(pointer)
  controller.pointerMove({ ...pointer, x: 1000 }, true)
  controller.step(0)
  controller.step(20)
  controller.step(40)
  expect(scene.get().viewport.scrollX).toBe(30)
  const moved = scene.get().tracks[0]?.clips[0]?.startBar
  expect(moved).toBeGreaterThan(15)
  controller.interrupt()
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
  controller.dispose()
  scene.setHover({ id: "new-owner", region: "body" })
  controller.dispose()
  controller.pointerLeave()
  controller.pointerDown(pointer)
  controller.pointerMove({ ...pointer, x: 400 }, true)
  controller.step(80)
  expect(scene.get().hoverClip?.id).toBe("new-owner")
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
})

it("moves the fade mask between title and body across collapse transitions", () => {
  const fixture = mount({ audio: true })
  const paint = () =>
    fixture.root.render(<Surface scene={fixture.scene} controller={fixture.controller} />)
  projectActions.updateTrack("audio", { collapsed: true })
  paint()
  let card = fixture.renderer.findByTestId("clip-source-audio-clip")
  let mask = fixture.renderer.findByTestId("fade-mask-audio-clip")
  if (!card || !mask) throw new Error("Missing collapsed fade mask")
  let cardBounds = fixture.renderer.getElementBounds(card.id)
  let maskBounds = fixture.renderer.getElementBounds(mask.id)
  if (!cardBounds || !maskBounds) throw new Error("Unpainted collapsed mask")
  expect(maskBounds.y).toBe(cardBounds.y)
  expect(maskBounds.height).toBe(cardBounds.height)
  expect(fixture.renderer.findByTestId("fade-audio-clip-in-peak")).toBeUndefined()
  projectActions.updateTrack("audio", { collapsed: false })
  paint()
  const row = layoutTrackRows(fixture.scene.get()).find(row => row.track.id === "audio")
  const clip = row?.track.clips[0]
  if (!row || !clip) throw new Error("Missing expanded audio")
  const geometry = clipVisualGeometry(clipRect(clip, row, 64, 0), clip, row.track, true)
  fixture.renderer.nativeSimulateMouseMove(200, geometry.bodyTop + 10)
  card = fixture.renderer.findByTestId("clip-source-audio-clip")
  mask = fixture.renderer.findByTestId("fade-mask-audio-clip")
  if (!card || !mask) throw new Error("Missing expanded fade mask")
  cardBounds = fixture.renderer.getElementBounds(card.id)
  maskBounds = fixture.renderer.getElementBounds(mask.id)
  if (!cardBounds || !maskBounds) throw new Error("Unpainted expanded mask")
  expect(maskBounds.y).toBe(geometry.bodyTop)
  expect(maskBounds.y).toBeGreaterThan(cardBounds.y)
  expect(maskBounds.y + maskBounds.height).toBeCloseTo(cardBounds.y + cardBounds.height)
  expect(fixture.renderer.findByTestId("fade-audio-clip-in-peak")).toBeDefined()
  projectActions.updateTrack("audio", { collapsed: true })
  paint()
  card = fixture.renderer.findByTestId("clip-source-audio-clip")
  mask = fixture.renderer.findByTestId("fade-mask-audio-clip")
  if (!card || !mask) throw new Error("Collapsed mask did not return")
  cardBounds = fixture.renderer.getElementBounds(card.id)
  maskBounds = fixture.renderer.getElementBounds(mask.id)
  if (!cardBounds || !maskBounds) throw new Error("Unpainted restored mask")
  expect(maskBounds.y).toBe(cardBounds.y)
  expect(maskBounds.height).toBe(cardBounds.height)
  expect(fixture.renderer.findByTestId("fade-audio-clip-in-peak")).toBeUndefined()
})

it.each([DEFAULT_DESIGN_TOKENS, overriddenDesign])(
  "maps retained input drag cursors through the supplied theme",
  design => {
    const { renderer, host, scene, sourceRow } = mount({ audio: true, design })
    renderer.nativeSimulateMouseMove(100, sourceRow.top + 6)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.grab)
    renderer.nativeSimulateMouseMove(318, sourceRow.top + 6)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.horizontalResize)
    renderer.nativeSimulateMouseDown(100, sourceRow.top + 6)
    renderer.nativeSimulateMouseMove(228, sourceRow.top + 6, 0)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.grabbing)
    const audio = layoutTrackRows(scene.get()).find(row => row.track.id === "audio")
    if (!audio) throw new Error("Missing incompatible track")
    renderer.nativeSimulateMouseMove(228, audio.top + 6, 0)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.disabled)
    renderer.nativeSimulateMouseUp(228, audio.top + 6)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.default)
    expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
  }
)

it("double click on the retained surface creates a Clip that can be renamed inline", () => {
  const { renderer, host, sourceRow, scene } = mount({ design: overriddenDesign })
  flushSync(() =>
    handleGpuixEvent(
      {
        eventType: "mouseDown",
        elementId: host,
        x: 448,
        y: sourceRow.top + 6,
        button: 0,
        clickCount: 2,
      },
      renderer
    )
  )
  const created = useProjectState
    .getState()
    .document.tracks[0]?.clips.find(clip => clip.startBar === 8)
  if (!created) throw new Error("Double click did not create Clip")
  projectActions.updateTrack(sourceRow.track.id, { collapsed: true })
  scene.setGeometry({
    ...scene.get().geometry,
    arrangement: {
      ...scene.get().geometry.arrangement,
      clip: {
        ...scene.get().geometry.arrangement.clip,
        nameEditorLeftInset: 5,
        nameEditorRightInset: 9,
        verticalInset: 3,
      },
    },
  })
  renderer.nativeSimulateKeystrokes(host, "cmd-r")
  const editor = renderer.findByTestId("clip-name-editor")
  if (!editor) throw new Error("Missing inline name editor")
  expect(editor.style.borderRadius).toBe(7)
  const row = layoutTrackRows(scene.get()).find(item => item.track.id === sourceRow.track.id)
  if (!row) throw new Error("Missing inline editor row")
  const rect = clipRect(created, row, scene.get().viewport.pxPerBar, scene.get().viewport.scrollX)
  expect(editor.style.left).toBe(rect.left + 5)
  expect(editor.style.top).toBe(rect.top + 3)
  expect(editor.style.width).toBe(
    Math.min(DEFAULT_LAYOUT_TOKENS.track.controlsWidth, 1000 - rect.left - 5, rect.width - 14)
  )
  expect(editor.style.height).toBe(
    Math.min(DEFAULT_LAYOUT_TOKENS.track.titleHeight, row.height - 6)
  )
  renderer.simulateKeystrokes("r 2 enter")
  expect(
    useProjectState.getState().document.tracks[0]?.clips.find(clip => clip.id === created.id)?.label
  ).toBe("r2")
})

it("Space reaches playback without reopening a dismissed lane menu", () => {
  const { renderer, host, sourceRow, windowKeys } = mount()
  renderer.nativeSimulateClick(100, sourceRow.top + 6, 2)
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeDefined()
  renderer.simulateKeystrokes("escape")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
  renderer.nativeSimulateKeystrokes(host, "space")
  expect(windowKeys.filter(key => key === "space")).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
})

it("clears the selected Clip target when an automation gesture takes ownership", () => {
  const { renderer, scene, sourceRow } = mount()
  renderer.nativeSimulateClick(100, sourceRow.top + 6)
  expect(scene.get().targetSelection.kind).toBe("clip")
  projectActions.setMode("automationMode", true)
  renderer.nativeSimulateMouseDown(900, sourceRow.top + 40)
  expect(scene.get().targetSelection.kind).not.toBe("clip")
  renderer.nativeSimulateMouseUp(900, sourceRow.top + 40)
})

it("opens the selected Clip context menu from the stable keyboard owner without a previous right click", () => {
  const { renderer, host, sourceRow } = mount()
  renderer.nativeSimulateClick(100, sourceRow.top + 6)
  renderer.nativeSimulateKeystrokes(host, "shift-f10")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeDefined()
  renderer.simulateKeystrokes("escape")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
})

for (const action of ["rename", "delete"] as const) {
  it(`keeps the selected clipped Clip identity for keyboard menu ${action}`, () => {
    const { renderer, scene, host, sourceRow } = mount()
    renderer.nativeSimulateClick(100, sourceRow.top + 6)
    projectActions.setViewport({ scrollX: 317 })
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === "source")
    const clip = row?.track.clips.find(item => item.id === "pattern")
    if (!row || !clip) throw new Error("Missing selected Clip")
    const rect = clipRect(clip, row, scene.get().viewport.pxPerBar, scene.get().viewport.scrollX)
    expect(rect.left).toBeLessThan(0)
    expect(rect.left + rect.width).toBe(3)
    renderer.nativeSimulateKeystrokes(host, "shift-f10")
    const item = renderer.findByText(
      labelsByLocale.en[action === "rename" ? "arrangement.rename" : "arrangement.deleteClip"]
    )
    const bounds = item && renderer.getElementBounds(item.id)
    if (!bounds) throw new Error(`Missing selected Clip ${action} action`)
    if (action === "rename") projectActions.setViewport({ scrollX: 0 })
    renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    if (action === "rename") {
      const editor = renderer.findByTestId("clip-name-editor")
      if (!editor) throw new Error("Missing selected Clip rename editor")
      expect(renderer.getFocusedElementId()).toBe(editor.id)
      renderer.simulateKeystrokes("t a i l enter")
      expect(
        useProjectState.getState().document.tracks[0]?.clips.find(item => item.id === "pattern")
          ?.label
      ).toBe("tail")
    } else {
      expect(useProjectState.getState().document.tracks[0]?.clips).toEqual([])
    }
  })
}

for (const action of ["edit", "delete"] as const) {
  it(`keeps the second-track automation point identity for keyboard menu ${action}`, () => {
    const { renderer, scene, host } = mount({ automation: true, design: overriddenDesign })
    projectActions.setAutomationParameter("target", "volume")
    const row = activeAutomationRows(scene.get()).find(item => item.track.id === "target")
    if (!row) throw new Error("Missing second-track automation row")
    projectActions.setAutomationPoint("target", row.laneId, {
      id: "target-point",
      bar: 2.5,
      value: 0.5,
    })
    expect(useProjectState.getState().document.tracks[1]?.automation[0]?.points).toEqual([
      { id: "target-point", bar: 2.5, value: 0.5 },
    ])
    scene.setTargetSelection({
      kind: "automation",
      trackId: "target",
      laneId: row.laneId,
      pointIds: ["target-point"],
    })
    renderer.nativeSimulateKeystrokes(host, "shift-f10")
    const item = renderer.findByText(
      labelsByLocale.en[
        action === "edit" ? "arrangement.editAutomationValue" : "arrangement.deleteAutomationPoint"
      ]
    )
    const bounds = item && renderer.getElementBounds(item.id)
    if (!bounds) throw new Error(`Missing selected automation point ${action} action`)
    renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    if (action === "edit") {
      const editor = renderer.findByTestId("automation-value-editor")
      if (!editor) throw new Error("Missing selected automation value editor")
      expect(editor.style.borderRadius).toBe(7)
      expect(editor.style.left).toBe(107)
      expect(renderer.getFocusedElementId()).toBe(editor.id)
      renderer.simulateKeystrokes("- 1 0 . 5 enter")
      expect(useProjectState.getState().document.tracks[1]?.automation[0]?.points).toEqual([
        { id: "target-point", bar: 2.5, value: 0.75 },
      ])
    } else {
      expect(useProjectState.getState().document.tracks[1]?.automation[0]?.points).toEqual([])
    }
    expect(useProjectState.getState().document.tracks[0]?.automation[0]?.points).toEqual([
      { id: "a", bar: 2.5, value: 0.5 },
      { id: "b", bar: 5, value: 0.8 },
      { id: "outside", bar: 20, value: 0.1 },
    ])
  })
}

for (const gesture of [
  { name: "native right click", modifiers: "" },
  { name: "normalized Ctrl-left context click", modifiers: "ctrl" },
]) {
  it(`applies the ${gesture.name} menu to its Clip rather than the previous selection`, () => {
    const { renderer, scene } = mount({ audio: true })
    const audioRow = layoutTrackRows(scene.get()).find(row => row.track.id === "audio")
    if (!audioRow) throw new Error("Missing audio target")
    projectActions.selectClips(["pattern"])
    const host = renderer.findByTestId("lane-surface")
    if (!host) throw new Error("Missing context event host")
    const elementId = host.id
    flushSync(() =>
      handleGpuixEvent(
        {
          eventType: "contextMenu",
          elementId,
          x: 100,
          y: audioRow.top + 6,
          button: 2,
          isRightClick: true,
          modifiers: { ctrl: gesture.modifiers === "ctrl", shift: false, alt: false, cmd: false },
        },
        renderer
      )
    )
    renderer.flush()
    const remove = renderer.findByText(labelsByLocale.en["arrangement.deleteClip"])
    const bounds = remove && renderer.getElementBounds(remove.id)
    if (!bounds) throw new Error("Missing target Clip menu action")
    renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    const tracks = useProjectState.getState().document.tracks
    expect(tracks.find(track => track.id === "source")?.clips.map(clip => clip.id)).toEqual([
      "pattern",
    ])
    expect(tracks.find(track => track.id === "audio")?.clips).toEqual([])
  })
}

it.each([DEFAULT_DESIGN_TOKENS, overriddenDesign])(
  "maps native fade curve hover and drag cursors",
  design => {
    const { renderer, scene, host } = mount({ audio: true, design })
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === "audio")
    const clip = row?.track.clips[0]
    if (!row || !clip) throw new Error("Missing fade cursor fixture")
    const visual = clipVisualGeometry(clipRect(clip, row, 64, 0), clip, row.track, true)
    const curve = visual.fades[0]?.curve
    if (!curve) throw new Error("Missing fade curve")
    renderer.nativeSimulateMouseMove(curve.x, curve.y)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.fadeCurve)
    renderer.nativeSimulateMouseDown(curve.x, curve.y)
    renderer.nativeSimulateMouseMove(curve.x + 4, curve.y + 4, 0)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.fadeCurve)
    renderer.nativeSimulateMouseUp(curve.x + 4, curve.y + 4)
  }
)

it.each([DEFAULT_DESIGN_TOKENS, overriddenDesign])(
  "maps native automation segment and drawing cursors",
  design => {
    const { renderer, scene, host, controller } = mount({ automation: true, design })
    projectActions.setAutomationParameter("source", "volume")
    const row = activeAutomationRows(scene.get()).find(item => item.track.id === "source")
    if (!row) throw new Error("Missing automation cursor row")
    const x = (3.75 - 1) * scene.get().viewport.pxPerBar
    const y = automationY(row, 0.65)
    renderer.nativeSimulateMouseMove(x, y)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.verticalResize)
    flushSync(() => {
      handleGpuixEvent(
        {
          eventType: "mouseDown",
          elementId: host,
          x,
          y,
          button: 0,
          modifiers: { alt: true, shift: false, cmd: false, ctrl: false },
        },
        renderer
      )
      handleGpuixEvent(
        {
          eventType: "mouseMove",
          elementId: host,
          x,
          y: y + 4,
          pressedButton: 0,
          modifiers: { alt: true, shift: false, cmd: false, ctrl: false },
        },
        renderer
      )
    })
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.verticalResize)
    controller.interrupt()
    projectActions.setMode("drawMode", true)
    renderer.nativeSimulateMouseMove(400, row.top + 6)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.automationDraw)
    renderer.nativeSimulateMouseDown(400, row.top + 6)
    renderer.nativeSimulateMouseMove(420, row.top + 10, 0)
    expect(renderer.getElement(host)?.style.cursor).toBe(design.cursors.automationDraw)
    renderer.nativeSimulateMouseUp(420, row.top + 10)
  }
)

it("uses live injected ruler geometry for the retained input host origin", () => {
  const f = mount({ design: overriddenDesign })
  function GeometryOriginSurface() {
    const scene = useSyncExternalStore(f.scene.subscribe, f.scene.get)
    const { wrap, ...surface } = useLaneSurface(f.controller, labelsByLocale.en)
    return wrap(
      <div
        {...surface}
        testId="geometry-origin-host"
        style={{
          ...surface.style,
          position: "absolute",
          top: scene.geometry.arrangement.barRulerHeight,
          width: 1000,
          height: 400,
        }}
      />
    )
  }
  f.scene.setGeometry({
    ...f.scene.get().geometry,
    arrangement: { ...f.scene.get().geometry.arrangement, barRulerHeight: 47 },
  })
  f.root.render(
    <ThemeProvider design={overriddenDesign}>
      <GeometryOriginSurface />
    </ThemeProvider>
  )
  const host = f.renderer.findByTestId("geometry-origin-host")
  if (!host) throw new Error("Missing injected-origin input host")
  f.renderer.nativeSimulateMouseMove(100, 53)
  expect(f.renderer.getElement(host.id)?.style.cursor).toBe(overriddenDesign.cursors.grab)
  f.scene.setGeometry({
    ...f.scene.get().geometry,
    arrangement: { ...f.scene.get().geometry.arrangement, barRulerHeight: 61 },
  })
  f.renderer.nativeSimulateMouseMove(100, 67)
  expect(f.renderer.getElement(host.id)?.style.cursor).toBe(overriddenDesign.cursors.grab)
})
