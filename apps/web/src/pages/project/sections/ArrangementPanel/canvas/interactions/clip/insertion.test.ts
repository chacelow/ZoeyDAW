// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { createClipInteractions } from "."
import type { CanvasPointer } from "../types"
import { gridZoomLimit } from "@/pages/project/model/grid"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

function setup() {
  const scene = createSceneStore()
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 256,
    grid: { mode: "adaptive", density: "narrowest" },
    transport: state.document.transport,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  const zoom = gridZoomLimit(
    state.document.transport.numerator,
    state.document.transport.denominator
  )
  scene.setViewport({
    pxPerBar: zoom,
    scrollX: 8 * zoom,
    scrollY: 0,
    width: 1200,
    height: 700,
    dpr: 1,
  })
  const interaction = createClipInteractions({
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  })
  const row = (trackId: string) =>
    layoutTrackRows(scene.get()).find(item => item.track.id === trackId)!
  const pointer = (x: number, y: number): CanvasPointer => ({
    x,
    y,
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  })
  return { scene, interaction, pointer, row }
}

it("clicks a Clip body and blank track, retaining an exact row-local insertion", () => {
  const { interaction, pointer, row } = setup()
  const audio = row("3-audio")
  const clip = pointer(16, audio.top + audio.height - 5)
  projectActions.setTimeSelection({ startBar: 2, endBar: 3, trackIds: ["3-audio"] })
  interaction.start(clip)?.finish(false)
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["3-audio"])
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("arrangement")
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: "3-audio",
    bar: 9 + 2 / 16384,
  })
  expect(useProjectState.getState().session.timeSelection).toBeNull()
  expect(useProjectState.getState().session.editingClipId).toBeNull()
  const blank = pointer(32, row("4-midi").top + row("4-midi").height / 2)
  interaction.start(blank)?.finish(false)
  expect(useProjectState.getState().session.selectedTrackIds).toEqual(["4-midi"])
  expect(useProjectState.getState().session.trackSelectionSurface).toBe("arrangement")
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: "4-midi",
    bar: 9 + 4 / 16384,
  })
})

it("uses a clicked title's start and follows the final moved card rather than its pointer offset", () => {
  const { scene, interaction, pointer, row } = setup()
  const audio = row("3-audio")
  projectActions.setTimeSelection({ startBar: 10, endBar: 11, trackIds: [audio.track.id] })
  interaction.start(pointer(80, audio.top + 6))?.finish(false)
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: audio.track.id,
    bar: 1,
  })
  expect(useProjectState.getState().session.timeSelection).toBeNull()
  const gesture = interaction.start(pointer(80, audio.top + 6))!
  gesture.move(pointer(80 + scene.get().viewport.pxPerBar, audio.top + 6))
  gesture.finish(false)
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: audio.track.id,
    bar: 2,
  })
  projectActions.togglePlay()
  expect(useProjectState.getState().session.position).toEqual({ bar: 2, beat: 1, sixteenth: 1 })
})

it("keeps playback at the left start when resizing either edge and clears the transient guide", () => {
  const { scene, interaction, pointer, row } = setup()
  scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 900, height: 700, dpr: 1 })
  const y = row("3-audio").top + 6
  const left = interaction.start(pointer(3, y))!
  left.move(pointer(35, y))
  expect(scene.get().clipResize).toEqual({ id: "audio-1", edge: "left" })
  left.finish(false)
  expect(useProjectState.getState().session.insertionPoint).toEqual({ trackId: "3-audio", bar: 2 })
  expect(scene.get().clipResize).toBeNull()
  scene.setMusic({ ...scene.get(), tracks: useProjectState.getState().document.tracks })
  projectActions.setInsertionPoint({ trackId: "3-audio", bar: 9 })
  const right = interaction.start(pointer(510, y))!
  right.move(pointer(542, y))
  expect(scene.get().clipResize).toEqual({ id: "audio-1", edge: "right" })
  right.finish(false)
  expect(useProjectState.getState().session.insertionPoint).toEqual({ trackId: "3-audio", bar: 2 })
  expect(scene.get().clipResize).toBeNull()
})

it("cancels a range drag without changing the prior anchor or committed time selection", () => {
  const { interaction, pointer, row, scene } = setup()
  const audio = row("3-audio")
  const first = pointer(24, audio.top + audio.height - 5)
  projectActions.setInsertionPoint({ trackId: "3-audio", bar: 9 + 1 / 65536 })
  const previous = { startBar: 2, endBar: 3, trackIds: ["3-audio"] }
  projectActions.setTimeSelection(previous)
  scene.setTimeSelection(previous)
  const gesture = interaction.start(first)!
  gesture.move(pointer(104, first.y))
  gesture.finish(true)
  expect(useProjectState.getState().session.timeSelection).toEqual(previous)
  expect(scene.get().timeSelection).toEqual(previous)
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: "3-audio",
    bar: 9 + 1 / 65536,
  })
  const drag = interaction.start(first)!
  drag.move(pointer(104, first.y))
  drag.finish(false)
  expect(useProjectState.getState().session.timeSelection).toEqual({
    startBar: 9 + 3 / 16384,
    endBar: 9 + 13 / 16384,
    trackIds: ["3-audio"],
  })
  expect(useProjectState.getState().session.insertionPoint).toEqual({
    trackId: "3-audio",
    bar: 9 + 3 / 16384,
  })
})
