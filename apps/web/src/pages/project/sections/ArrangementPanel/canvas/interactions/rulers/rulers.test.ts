import { DEFAULT_TRACK_HEIGHT, arrangementViewProjection } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { createElement } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import {
  arrangementScene,
  createSceneStore,
} from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { MarkerEditor } from "./MarkerEditor"
import { createRulerInteractions } from "."
import type { CanvasPointer } from "../types"

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
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})

afterEach(() => {
  cleanup()
  arrangementScene.setTargetSelection({ kind: "none" })
})

function fixture() {
  const scene = createSceneStore()
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: arrangementViewProjection(state.document.tracks, state.workspace.arrangementView)
      .tracks,
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

for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
  it(`keeps a locator rename draft during composition (${JSON.stringify(composition)})`, () => {
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Marker creation failed")
    const { scene } = fixture()
    const music = scene.get()
    arrangementScene.setMusic({
      bars: music.bars,
      grid: music.grid,
      transport: music.transport,
      media: music.media,
      patterns: music.patterns,
      markers: music.markers,
      loop: music.loop,
      tracks: music.tracks,
    })
    arrangementScene.setTargetSelection({ kind: "marker", id, phase: "renaming" })
    const document = useProjectState.getState().document
    const view = render(createElement(MarkerEditor))
    const input = view.getByRole("textbox")
    fireEvent.change(input, { target: { value: "副歌" } })
    for (const key of ["Enter", "Escape"]) {
      expect(fireEvent.keyDown(input, { key, ...composition })).toBe(true)
      expect(globalThis.document.activeElement).toBe(input)
      expect(useProjectState.getState().document).toBe(document)
      expect(arrangementScene.get().targetSelection).toMatchObject({ phase: "renaming" })
    }
    fireEvent.keyDown(input, { key: "Enter" })
    expect(
      useProjectState.getState().document.markers.find(marker => marker.id === id)?.label
    ).toBe("副歌")
    expect(arrangementScene.get().targetSelection).toMatchObject({ phase: "selected" })
  })
}

it("previews marker travel, cancels without history, then commits one snapped movement", () => {
  const id = projectActions.addMarker(3)
  if (!id) {
    throw new Error("Marker creation failed")
  }
  const { scene, interaction } = fixture()
  const start = pointer(64, 42)
  const gesture = interaction.start(start)
  expect(gesture).not.toBeNull()
  gesture?.move(pointer(101, 42))
  expect(scene.get().markers.find(marker => marker.id === id)?.bar).toBe(4)
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  gesture?.finish(true)
  expect(scene.get().previewMarkers).toBeNull()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(3)
  const next = interaction.start(start)
  next?.move(pointer(101, 42))
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
    media: state.document.media,
    patterns: state.document.patterns,
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

it("selects the disabled loop span across every document track without enabling playback looping", () => {
  projectActions.setArrangementView("returns", false)
  projectActions.setLoop({ enabled: false, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  expect(scene.get().tracks.some(track => track.kind === "return")).toBe(false)
  const before = structuredClone(useProjectState.getState().document)
  const click = interaction.start(pointer(112, 24))
  expect(click).not.toBeNull()
  click?.finish(false)
  const selection = useProjectState.getState().session.timeSelection
  expect(selection).toEqual({
    startBar: 3,
    endBar: 7,
    trackIds: before.tracks.map(track => track.id),
    emphasis: "subtle",
  })
  expect(scene.get().timeSelection).toEqual(selection)
  expect(scene.get().targetSelection).toEqual({ kind: "loop" })
  expect(useProjectState.getState().document).toEqual(before)
})

it("cancels a disabled loop drag without changing the document or selecting tracks", () => {
  projectActions.setLoop({ enabled: false, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  const before = structuredClone(useProjectState.getState().document)
  const drag = interaction.start(pointer(112, 24))
  drag?.move(pointer(144, 24))
  expect(scene.get().loop).toMatchObject({ enabled: false, startBar: 4, endBar: 8 })
  drag?.finish(true)
  expect(scene.get().previewLoop).toBeNull()
  expect(useProjectState.getState().document).toEqual(before)
  expect(useProjectState.getState().session.timeSelection).toBeNull()
})

it("resizes a disabled loop edge without enabling playback looping", () => {
  projectActions.setLoop({ enabled: false, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  const before = structuredClone(useProjectState.getState().document)
  const drag = interaction.start(pointer(64, 24))
  expect(drag).not.toBeNull()
  drag?.move(pointer(96, 24))
  expect(scene.get().loop).toMatchObject({ enabled: false, startBar: 4, endBar: 7 })
  drag?.finish(false)
  expect(useProjectState.getState().document.transport.loop).toEqual({
    enabled: false,
    startBar: 4,
    endBar: 7,
  })
  expect(useProjectState.getState().document.tracks).toEqual(before.tracks)
  expect(useProjectState.getState().document.markers).toEqual(before.markers)
})

it("does not toggle a disabled loop on double click", () => {
  projectActions.setLoop({ enabled: false, startBar: 3, endBar: 7 })
  const { scene, interaction } = fixture()
  expect(interaction.doubleClick(pointer(112, 24))).toBe(true)
  expect(scene.get().targetSelection).toEqual({ kind: "loop" })
  expect(useProjectState.getState().document.transport.loop).toEqual({
    enabled: false,
    startBar: 3,
    endBar: 7,
  })
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
  if (!id) {
    throw new Error("Marker creation failed")
  }
  const { interaction } = fixture()
  const drag = interaction.start(pointer(64, 42))
  drag?.move(pointer(72, 42, true))
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
  expect(interaction.doubleClick(pointer(320, 42))).toBe(true)
  const marker = useProjectState.getState().document.markers.find(item => item.bar === 11)
  expect(marker).toBeDefined()
  if (!marker) {
    throw new Error("Marker creation failed")
  }
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  expect(interaction.contextMenu(pointer(320, 42))).toEqual({ kind: "marker", markerId: marker.id })
  expect(interaction.doubleClick(pointer(320, 42))).toBe(true)
  expect(useProjectState.getState().session).toMatchObject({ playing: true, position: { bar: 11 } })
  expect(interaction.doubleClick(pointer(320, 42))).toBe(true)
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
  expect(interaction.contextMenu(pointer(0, 42))).toEqual({ kind: "marker", markerId: "intro" })
  expect(interaction.contextMenu(pointer(0, 25))).toEqual({ kind: "loop" })
  expect(interaction.contextMenu(pointer(400, 25))).toEqual({ kind: "ruler", bar: 14 })
})

it("uses unsnapped marker travel when workspace snap is off", () => {
  const id = projectActions.addMarker(3)
  if (!id) {
    throw new Error("Marker creation failed")
  }
  projectActions.setSnap(false)
  const { interaction } = fixture()
  const drag = interaction.start(pointer(64, 42))
  drag?.move(pointer(72, 42))
  drag?.finish(false)
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar
  ).toBeCloseTo(3.25)
})
