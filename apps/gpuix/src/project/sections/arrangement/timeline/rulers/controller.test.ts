import { beforeEach, expect, test } from "bun:test"
import {
  hydrateProject,
  projectActions,
  serializeProject,
  useProjectState,
} from "../../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../../adapters/fixtures"
import { initialSession, useProjectState as projectStore } from "../../../../stores/useProjectState"
import { createSceneStore } from "../../core/scene"
import { createRulerController } from "./controller"
import { createTimelineController } from "../controller"

beforeEach(() => {
  projectStore.setState({
    document: createMockDocument(),
    workspace: createMockWorkspace(),
    session: initialSession(),
  })
})

function mount() {
  const scene = createSceneStore()
  const project = useProjectState.getState().document
  scene.setMusic({
    ...scene.get(),
    tracks: project.tracks,
    markers: project.markers,
    loop: project.transport.loop,
    transport: project.transport,
  })
  scene.setViewport({ width: 800, height: 320, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
  return { scene, controller: createRulerController(scene) }
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
    sceneStore: createSceneStore(),
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  try {
    owner.view.rulers.down(200, 8)
    owner.keyboard.down({
      elementId: 0,
      eventType: "keyDown",
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
