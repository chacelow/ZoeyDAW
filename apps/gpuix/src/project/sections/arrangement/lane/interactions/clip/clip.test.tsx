import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, expect, it } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { hydrateProject, projectActions, useProjectState } from "../../../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../../../adapters/fixtures"
import { alignmentBar } from "../../../core/clip-alignment"
import { createSceneStore } from "../../../core/scene"
import { layoutTrackRows } from "../../../core/layout"
import { createTestTimeline } from "../../testing/project-scene.test-helper"
import type { LaneContext, LaneGesture, LanePointer } from "../types"
import { createClipInteractions } from "."

let root: TestRoot | undefined
let releaseTimeline: (() => void) | undefined
beforeEach(() => {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI track")
  track.clips = [
    {
      id: "pattern",
      kind: "pattern",
      patternId: "p",
      startBar: 2,
      lengthBars: 4,
      steps: [true, false],
    },
  ]
  track.output = "main"
  document.tracks = [track, ...document.tracks.filter(item => item.kind === "main")]
  const workspace = createMockWorkspace()
  workspace.pxPerBar = 64
  workspace.scrollX = 0
  workspace.scrollY = 0
  workspace.grid = { mode: "fixed", bars: 0.25 }
  workspace.automationMode = false
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
})
afterEach(() => {
  root?.unmount()
  releaseTimeline?.()
  root = undefined
  releaseTimeline = undefined
})

function mount() {
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  const context: LaneContext = {
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  releaseTimeline = createTestTimeline(scene, 1000, 350).dispose
  const interactions = createClipInteractions(context)
  let gesture: LaneGesture | null = null
  const pointer = (x = 0, y = 0): LanePointer => ({
    x,
    y,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  })
  root = createTestRoot({ width: 1000, height: 350 })
  root.render(
    <div
      testId="lane-gesture"
      style={{ width: 1000, height: 350 }}
      onMouseDown={event => {
        gesture = interactions.start(pointer(event.x, event.y))
      }}
      onMouseMove={event => {
        if (event.pressedButton === 0) gesture?.move(pointer(event.x, event.y))
      }}
      onMouseUp={() => {
        gesture?.finish(false)
        gesture = null
      }}
      onKeyDown={event => {
        if (event.key === "escape") {
          gesture?.finish(true)
          gesture = null
        }
      }}
    />
  )
  const node = root.renderer.findByTestId("lane-gesture")
  const row = layoutTrackRows(scene.get())[0]
  if (!node || !row) throw new Error("Missing lane")
  return {
    renderer: root.renderer,
    scene,
    row,
    id: node.id,
    editorRequest: useProjectState.getState().session.clipEditorRequest,
  }
}

it("moves only through runtime preview, preserves source, commits once and undoes", () => {
  const { renderer, scene, row, editorRequest } = mount()
  renderer.nativeSimulateMouseDown(100, row.top + 6)
  expect(useProjectState.getState().session.clipEditorRequest).toBe(editorRequest)
  renderer.nativeSimulateMouseMove(228, row.top + 6, 0)
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
  expect(scene.get().tracks[0]?.clips[0]?.startBar).toBe(4)
  expect(alignmentBar(scene.get())).toBe(4)
  expect(scene.get().clipDrag?.source[0]?.clips[0]?.startBar).toBe(2)
  renderer.nativeSimulateMouseUp(228, row.top + 6)
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(4)
  expect(scene.get().clipDrag).toBeNull()
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(4)
  projectActions.undo()
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2)
})

it("cancels a resize without consuming history and always guides from the left origin", () => {
  const { renderer, scene, row, id } = mount()
  renderer.nativeSimulateMouseDown(319, row.top + 6)
  renderer.nativeSimulateMouseMove(383, row.top + 6, 0)
  expect(scene.get().tracks[0]?.clips[0]?.lengthBars).toBe(5)
  expect(alignmentBar(scene.get())).toBe(2)
  renderer.nativeSimulateKeyDown(id, "escape")
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.lengthBars).toBe(4)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("places insertion at content clicks without opening Clip View", () => {
  const { renderer, row, editorRequest } = mount()
  renderer.nativeSimulateMouseDown(192, row.top + 30)
  renderer.nativeSimulateMouseUp(192, row.top + 30)
  expect(useProjectState.getState().session.insertionPoint?.bar).toBe(4)
  expect(useProjectState.getState().session.timeSelection).toBeNull()
  expect(useProjectState.getState().session.clipEditorRequest).toBe(editorRequest)
})
