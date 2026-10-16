import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { createTimelineController } from "../controller"
import type { TimelineController } from "../controller"
import type { TimelineKeyboardInput } from "../keyboard/controller"

const owners: TimelineController[] = []
beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 2,
      document: createMockDocument(),
      workspace: {
        ...createMockWorkspace(),
        grid: { mode: "fixed", bars: 1 },
        pxPerBar: 32,
        scrollX: 0,
        scrollY: 0,
      },
    })
  )
})
afterEach(() => {
  for (const owner of owners) owner.dispose()
  owners.length = 0
})

function fixture() {
  const owner = createTimelineController({
    sceneStore: createSceneStore(DEFAULT_LAYOUT_TOKENS),
    initialSize: { containerWidth: 804, bodyHeight: 200, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  owners.push(owner)
  return { owner, scene: owner.sceneStore, rulers: owner.view.rulers }
}

function key(value: string, cmd = false): TimelineKeyboardInput {
  return {
    key: value,
    modifiers: { cmd, ctrl: false, alt: false, shift: false },
    defaultPrevented: false,
  }
}

test("locator preview cancels without history and a committed movement is one undo step", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  const { scene, rulers } = fixture()
  expect(rulers.down(64, 8)).toBe(true)
  rulers.move(101)
  expect(scene.get().markers.find(marker => marker.id === id)?.bar).toBe(4)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  rulers.cancel()
  expect(scene.get().previewMarkers).toBeNull()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  projectActions.undo()
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)
  ).toBeUndefined()
  projectActions.redo()
  rulers.down(64, 8)
  rulers.move(101)
  rulers.up()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(4)
  projectActions.undo()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
})

test("the left loop edge bypasses snap with Shift and cancellation restores its preview", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, rulers } = fixture()
  rulers.down(64, 24)
  rulers.move(78, true)
  expect(scene.get().loop.startBar).toBeCloseTo(3.4375)
  expect(scene.get().loop.endBar).toBe(7)
  rulers.cancel()
  expect(scene.get().previewLoop).toBeNull()
  expect(useProjectState.getState().document.transport.loop.startBar).toBe(3)
  rulers.down(64, 24)
  rulers.move(96)
  rulers.up()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 7,
  })
  projectActions.undo()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 3,
    endBar: 7,
  })
})

test("Cmd+L creates the selected musical loop through the window keyboard owner", () => {
  const { scene, owner } = fixture()
  projectActions.setTimeSelection({ startBar: 6, endBar: 9, trackIds: [] })
  expect(owner.keyboard.down(key("l", true))).toBe(true)
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    enabled: true,
    startBar: 6,
    endBar: 9,
  })
  expect(scene.get().targetSelection.kind).toBe("loop")
})

test("loop body travel preserves its span and the right edge alone changes duration", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, rulers } = fixture()
  rulers.down(112, 24)
  rulers.move(144)
  expect(scene.get().loop).toMatchObject({ startBar: 4, endBar: 8 })
  rulers.up()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 8,
  })
  rulers.down(224, 24)
  rulers.move(256)
  expect(scene.get().loop).toMatchObject({ startBar: 4, endBar: 9 })
  rulers.up()
  projectActions.undo()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 8,
  })
})

test("clicking the loop selects editable visible tracks without Return/Main or folded descendants", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { rulers } = fixture()
  rulers.down(112, 24)
  rulers.up()
  expect(useProjectState.getState().session.timeSelection).toEqual({
    startBar: 3,
    endBar: 7,
    trackIds: ["trager", "sidechain", "3-audio", "4-midi"],
  })
  projectActions.updateTrack("drums-group", { collapsed: true })
  rulers.down(112, 24)
  rulers.up()
  expect(useProjectState.getState().session.timeSelection).toEqual({
    startBar: 3,
    endBar: 7,
    trackIds: ["3-audio", "4-midi"],
  })
})

test("selected loop arrows use grid-sized musical steps and retain undo", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, rulers, owner } = fixture()
  rulers.down(112, 24)
  rulers.up()
  expect(scene.get().targetSelection.kind).toBe("loop")
  expect(owner.keyboard.down(key("right"))).toBe(true)
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 8,
  })
  projectActions.undo()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 3,
    endBar: 7,
  })
})

test("Shift locator travel and locator arrows never seek the transport", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  const { rulers, owner } = fixture()
  rulers.down(64, 8)
  rulers.move(72, true)
  rulers.up()
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
  projectActions.seekBar(2)
  expect(owner.keyboard.down(key("right"))).toBe(true)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(4.25)
  expect(useProjectState.getState().session.position.bar).toBe(2)
  expect(owner.keyboard.down(key("left"))).toBe(true)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
  projectActions.undo()
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(4.25)
})

test("double-click creates a locator and starts playback without toggling active playback off", () => {
  const { scene, rulers, owner } = fixture()
  expect(rulers.doubleClick(320, 8)).toBe(true)
  const marker = useProjectState.getState().document.markers.find(item => item.bar === 11)
  if (!marker) throw new Error("Marker creation failed")
  expect(rulers.doubleClick(320, 8)).toBe(true)
  expect(useProjectState.getState().session).toMatchObject({ playing: true, position: { bar: 11 } })
  expect(rulers.doubleClick(320, 8)).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(owner.keyboard.down(key("r", true))).toBe(true)
  expect(scene.get().targetSelection).toEqual({ kind: "marker", id: marker.id, phase: "renaming" })
  rulers.dispose()
  expect(scene.get().targetSelection).toEqual({ kind: "marker", id: marker.id, phase: "renaming" })
})

test("turning snap off retains unsnapped locator travel", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  projectActions.setSnap(false)
  const { rulers } = fixture()
  rulers.down(64, 8)
  rulers.move(72)
  rulers.up()
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
})
