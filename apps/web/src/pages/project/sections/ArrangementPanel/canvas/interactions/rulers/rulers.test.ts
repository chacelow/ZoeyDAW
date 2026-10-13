// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import type { CanvasPointer } from "../types"
import { createRulerInteractions } from "."

const pointer = (x: number, y: number, shiftKey = false): CanvasPointer => ({
  x,
  y,
  clientX: x,
  clientY: y,
  pointerId: 1,
  button: 0,
  shiftKey,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
})

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

function fixture() {
  const scene = createSceneStore()
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 500, height: 200, dpr: 1 })
  const interaction = createRulerInteractions({
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  })
  return { scene, interaction }
}

it("previews marker travel, cancels without history, then commits one snapped movement", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  const { scene, interaction } = fixture()
  const start = pointer(64, 8)
  const gesture = interaction.start(start)
  expect(gesture).not.toBeNull()
  gesture?.move(pointer(101, 8))
  expect(scene.get().markers.find(marker => marker.id === id)?.bar).toBe(4)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  gesture?.finish(true)
  expect(scene.get().previewMarkers).toBeNull()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  const next = interaction.start(start)
  next?.move(pointer(101, 8))
  next?.finish(false)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(4)
  projectActions.undo()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
})

it("resizes just one loop edge, bypasses snap with Shift, and cancels previews", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  const gesture = interaction.start(pointer(64, 24))
  gesture?.move(pointer(78, 24, true))
  expect(scene.get().loop.startBar).toBeCloseTo(3.4375)
  expect(scene.get().loop.endBar).toBe(7)
  gesture?.finish(true)
  expect(scene.get().previewLoop).toBeNull()
  expect(useProjectState.getState().document.transport.loop.startBar).toBe(3)
  const next = interaction.start(pointer(64, 24))
  next?.move(pointer(96, 24))
  next?.finish(false)
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

it("turns a selected time range into a loop with Cmd+L", () => {
  const { scene, interaction } = fixture()
  scene.setTimeSelection({ startBar: 6, endBar: 9, trackIds: [] })
  const event = new KeyboardEvent("keydown", { code: "KeyL", metaKey: true, cancelable: true })
  expect(interaction.keyDown(event)).toBe(true)
  expect(event.defaultPrevented).toBe(true)
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    enabled: true,
    startBar: 6,
    endBar: 9,
  })
  expect(scene.get().targetSelection.kind).toBe("loop")
})

it("moves the loop body without changing length and resizes the right edge alone", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  const body = interaction.start(pointer(112, 24))
  body?.move(pointer(144, 24))
  expect(scene.get().loop).toMatchObject({ startBar: 4, endBar: 8 })
  body?.finish(false)
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 8,
  })
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  const right = interaction.start(pointer(224, 24))
  right?.move(pointer(256, 24))
  expect(scene.get().loop).toMatchObject({ startBar: 4, endBar: 9 })
  right?.finish(false)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.loop).toMatchObject({
    startBar: 4,
    endBar: 8,
  })
})

it("clicks the loop body to select its span across editable visible tracks", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { interaction } = fixture()
  const click = interaction.start(pointer(112, 24))
  click?.finish(false)
  const selection = useProjectState.getState().session.timeSelection
  expect(selection).toMatchObject({ startBar: 3, endBar: 7 })
  expect(selection?.trackIds.length).toBeGreaterThan(0)
  const tracks = useProjectState.getState().document.tracks
  expect(
    selection?.trackIds.every(id =>
      tracks.some(track => track.id === id && (track.kind === "audio" || track.kind === "midi"))
    )
  ).toBe(true)
})

it("nudges a selected loop using grid-sized arrow steps", () => {
  projectActions.setLoop({ enabled: true, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  interaction.start(pointer(112, 24))?.finish(false)
  expect(scene.get().targetSelection.kind).toBe("loop")
  const arrow = new KeyboardEvent("keydown", { code: "ArrowRight", cancelable: true })
  expect(interaction.keyDown(arrow)).toBe(true)
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

it("bypasses marker snapping with Shift and nudges the selected locator without seeking", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  const { interaction } = fixture()
  const drag = interaction.start(pointer(64, 8))
  drag?.move(pointer(72, 8, true))
  drag?.finish(false)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
  projectActions.seekBar(2)
  const next = new KeyboardEvent("keydown", { code: "ArrowRight", cancelable: true })
  expect(interaction.keyDown(next)).toBe(true)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(4.25)
  expect(useProjectState.getState().session.position.bar).toBe(2)
  const previous = new KeyboardEvent("keydown", { code: "ArrowLeft", cancelable: true })
  expect(interaction.keyDown(previous)).toBe(true)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
  projectActions.undo()
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(4.25)
})

it("creates a marker and double-click starts playback without toggling active playback off", () => {
  const { scene, interaction } = fixture()
  expect(interaction.doubleClick(pointer(320, 8))).toBe(true)
  const marker = useProjectState.getState().document.markers.find(item => item.bar === 11)
  expect(marker).toBeDefined()
  if (!marker) throw new Error("Marker creation failed")
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  expect(interaction.contextMenu(pointer(320, 8))).toEqual({ kind: "marker", markerId: marker.id })
  expect(interaction.doubleClick(pointer(320, 8))).toBe(true)
  expect(useProjectState.getState().session).toMatchObject({ playing: true, position: { bar: 11 } })
  expect(interaction.doubleClick(pointer(320, 8))).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(true)
  const rename = new KeyboardEvent("keydown", { code: "KeyR", metaKey: true, cancelable: true })
  expect(interaction.keyDown(rename)).toBe(true)
  expect(scene.get().targetSelection).toEqual({ kind: "marker", id: marker.id, phase: "renaming" })
  interaction.deactivate()
  expect(scene.get().targetSelection).toEqual({ kind: "marker", id: marker.id, phase: "renaming" })
})

it("distinguishes marker and loop hit targets at the same bar", () => {
  projectActions.setLoop({ enabled: true, startBar: 1, endBar: 5 })
  const { interaction } = fixture()
  expect(interaction.contextMenu(pointer(0, 8))).toEqual({ kind: "marker", markerId: "intro" })
  expect(interaction.contextMenu(pointer(0, 25))).toEqual({ kind: "loop" })
  expect(interaction.contextMenu(pointer(400, 25))).toEqual({ kind: "ruler", bar: 14 })
})

it("uses unsnapped marker travel when workspace snap is off", () => {
  const id = projectActions.addMarker(3)
  if (!id) throw new Error("Marker creation failed")
  projectActions.setSnap(false)
  const { interaction } = fixture()
  const drag = interaction.start(pointer(64, 8))
  drag?.move(pointer(72, 8))
  drag?.finish(false)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
})
