import { afterEach, expect, it } from "bun:test"
import { useMemo, useSyncExternalStore } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import type { NativeClipboard } from "../../../../../platform/clipboard"
import { ThemeProvider } from "../../../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "../../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../../adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import type { SceneStore } from "../../core/scene"
import { clipRect, layoutTrackRows } from "../../core/layout"
import { clipVisualGeometry } from "../../core/clip-geometry"
import { LaneRow } from "../LaneRow"
import { LaneOverlay } from "../LaneOverlay"
import { visibleRows } from "../render-projection"
import { labelsByLocale } from "../demo/labels"
import { createLaneController } from "./controller"
import type { LaneController } from "./controller"
import { createTestTimeline } from "../testing/project-scene.test-helper"
import { AnimationFrameProvider } from "@/platform/frame"
import { createManualFrames } from "../testing/frames.test-helper"

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
})

function Surface({ scene, controller }: { scene: SceneStore; controller: LaneController }) {
  const snapshot = useSyncExternalStore(scene.subscribe, scene.get)
  const frames = useMemo(createManualFrames, [])
  return (
    <AnimationFrameProvider source={frames}>
      <ThemeProvider>
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
                  controller={controller}
                  readPeaks={() => new Float32Array(0)}
                  labels={labelsByLocale.en}
                />
              </div>
            </div>
          ))}
          <LaneOverlay
            scene={snapshot}
            viewport={snapshot.viewport}
            transportBar={() => useProjectState.getState().session.position.bar}
          />
        </div>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
}

function mount(options: { automation?: boolean; audio?: boolean } = {}) {
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
  const scene = createSceneStore()
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
  currentRoot.render(<Surface scene={scene} controller={current} />)
  const sourceRow = layoutTrackRows(scene.get()).find(row => row.track.id === "source")
  const targetRow = layoutTrackRows(scene.get()).find(row => row.track.id === "target")
  const host = currentRoot.renderer.findByTestId("lane-row-source")
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
  const clip = renderer.findByTestId("clip-source-pattern")
  if (!clip) throw new Error("Missing Clip")
  renderer.nativeSimulateKeystrokes(clip.id, "enter")
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

it("keeps Clip focus reachable by Tab and Space does not reopen a dismissed menu", () => {
  const { renderer, host, sourceRow, windowKeys } = mount()
  const clip = renderer.findByTestId("clip-source-pattern")
  if (!clip) throw new Error("Missing keyboard Clip target")
  renderer.nativeSimulateKeystrokes(host, "tab")
  expect(renderer.getFocusedElementId()).toBe(clip.id)
  renderer.nativeSimulateClick(100, sourceRow.top + 6, 2)
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeDefined()
  renderer.simulateKeystrokes("escape")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
  renderer.nativeSimulateKeystrokes(clip.id, "space")
  expect(windowKeys.filter(key => key === "space")).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
})

it("clears keyboard-activated Clip focus when an automation gesture takes ownership", () => {
  const { renderer, scene, sourceRow } = mount()
  const clip = renderer.findByTestId("clip-source-pattern")
  if (!clip) throw new Error("Missing Clip")
  renderer.nativeSimulateKeystrokes(clip.id, "enter")
  expect(scene.get().targetSelection.kind).toBe("clip")
  projectActions.setMode("automationMode", true)
  renderer.nativeSimulateMouseDown(900, sourceRow.top + 40)
  expect(scene.get().targetSelection.kind).not.toBe("clip")
  renderer.nativeSimulateMouseUp(900, sourceRow.top + 40)
})

it("opens the focused Clip context menu from the keyboard without a previous right click", () => {
  const { renderer } = mount()
  const clip = renderer.findByTestId("clip-source-pattern")
  if (!clip) throw new Error("Missing keyboard Clip")
  renderer.nativeSimulateKeystrokes(clip.id, "shift-f10")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeDefined()
  renderer.simulateKeystrokes("escape")
  expect(renderer.findByText(labelsByLocale.en["detail.openClip"])).toBeUndefined()
})

for (const gesture of [
  { name: "native right click", modifiers: "" },
  { name: "normalized Ctrl-left context click", modifiers: "ctrl" },
]) {
  it(`applies the ${gesture.name} menu to its Clip rather than the previous selection`, () => {
    const { renderer, scene } = mount({ audio: true })
    const audioRow = layoutTrackRows(scene.get()).find(row => row.track.id === "audio")
    if (!audioRow) throw new Error("Missing audio target")
    projectActions.selectClips(["pattern"])
    const host = renderer.findByTestId("lane-row-audio")
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
