import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, expect, test } from "bun:test"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
} from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { createTimelineController } from "../controller"

const disposals: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose()
})

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

function mount(policy: ArrangementPolicy = ARRANGEMENT_DEFAULTS) {
  projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
  const owner = createTimelineController({
    sceneStore: createSceneStore(DEFAULT_LAYOUT_TOKENS),
    readPolicy: () => policy,
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  disposals.push(owner.dispose)
  return { scene: owner.sceneStore, controller: owner.view.rulers }
}

test("a marker press cannot acquire a fresh edit after project hydration rotates ownership", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker not created")
  const a = mount()
  a.controller.down(200, 8)
  hydrateProject(serializeProject())
  a.controller.move(500)
  expect(useProjectState.getState().session.preview).toBeNull()
  a.controller.up()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  a.controller.dispose()
})

test("cancelling a seek from an old project cannot restore its playhead into the hydrated project", () => {
  const a = mount()
  projectActions.seekBar(10)
  a.controller.down(100, 0)
  hydrateProject(serializeProject())
  projectActions.seekBar(20)
  a.controller.cancel()
  expect(useProjectState.getState().session.position.bar).toBe(20)
  a.controller.dispose()
})

test("Undo during a pressed locator gesture cancels the gesture without consuming previous history", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker not created")
  projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
  const owner = createTimelineController({
    sceneStore: createSceneStore(DEFAULT_LAYOUT_TOKENS),
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  try {
    owner.view.rulers.down(200, 8)
    owner.keyboard.down({
      defaultPrevented: false,
      key: "z",
      modifiers: { ctrl: true, cmd: false, alt: false, shift: false },
    })
    owner.view.rulers.move(500)
    owner.view.rulers.up()
    expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
      3
    )
  } finally {
    owner.dispose()
  }
})

test("marker nudge reads the configured unsnapped step without replacing the active grid", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker not created")
  const { scene, controller } = mount({
    ...ARRANGEMENT_DEFAULTS,
    keyboard: { ...ARRANGEMENT_DEFAULTS.keyboard, markerNudgeBars: 1 / 8 },
  })
  projectActions.setSnap(false)
  scene.setTargetSelection({ kind: "marker", id, phase: "selected" })
  expect(controller.keyDown({ key: "right", defaultPrevented: false })).toBe(true)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
    3.125
  )
  projectActions.setGrid({ mode: "fixed", bars: 0.5 })
  projectActions.setSnap(true)
  expect(controller.keyDown({ key: "right", defaultPrevented: false })).toBe(true)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
    3.625
  )
})
