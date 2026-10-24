import { DEFAULT_TRACK_HEIGHT, TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { activeAutomationRows, automationRowValue, automationX, automationY } from "./geometry"
import { createAutomationInteractions } from "."
import type { CanvasPointer, InteractionContext } from "../types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: { ...createMockWorkspace(), grid: { mode: "fixed", bars: 1 } },
    })
  )
})

it("keeps automation out of card titles and removes folded-lane curve interactions", () => {
  const { scene, interaction, pointer } = setup()
  const row = layoutTrackRows(scene.get()).find(row => row.track.id === "3-audio")!
  const title = { ...pointer(9, 0.85), y: row.top + TRACK_TITLE_HEIGHT / 2 }
  expect(interaction.start(title)).toBeNull()
  expect(interaction.doubleClick(title)).toBe(false)
  projectActions.updateTrack("3-audio", { collapsed: true })
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  const folded = layoutTrackRows(scene.get()).find(row => row.track.id === "3-audio")!
  expect(interaction.start({ ...title, y: folded.top + folded.height / 2 })).toBeNull()
  expect(activeAutomationRows(scene.get()).some(row => row.track.id === "3-audio")).toBe(false)
})

function setup() {
  const scene = createSceneStore()
  const state = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: { bpm: 120, numerator: 4, denominator: 4 },
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
    media: state.document.media,
    patterns: state.document.patterns,
  })
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1200, height: 700, dpr: 1 })
  scene.setAutomationDisplay({ "3-audio": { kind: "mixer", parameter: "volume" } }, {}, true)
  const context: InteractionContext = {
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  const interaction = createAutomationInteractions(context)
  const row = activeAutomationRows(scene.get()).find(item => item.track.id === "3-audio")!
  const pointer = (
    bar: number,
    value: number,
    overrides: Partial<CanvasPointer> = {}
  ): CanvasPointer => ({
    x: automationX(scene.get(), bar),
    y: automationY(row, value),
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    ...overrides,
  })
  const points = () =>
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.automation[0]
      .points
  return { scene, interaction, pointer, points }
}

describe("automation canvas gestures", () => {
  it("selects several breakpoints, moves the group as one undo, and rolls back cancelled previews", () => {
    const { scene, interaction, pointer, points } = setup()
    interaction.start(pointer(1, 0.35, { shiftKey: true }))?.finish(false)
    interaction.start(pointer(9, 0.85, { shiftKey: true }))?.finish(false)
    expect(scene.get().targetSelection).toMatchObject({
      kind: "automation",
      pointIds: ["fade-up", "peak"],
    })
    const move = interaction.start(pointer(1, 0.35))!
    move.move(pointer(3, 0.45))
    expect(scene.get().previewTracks).not.toBeNull()
    move.finish(true)
    expect(points().map(point => point.bar)).toEqual([1, 9, 17])
    const commit = interaction.start(pointer(1, 0.35))!
    commit.move(pointer(3, 0.45))
    commit.finish(false)
    expect(points().map(point => point.bar)).toEqual([3, 11, 17])
    expect(scene.get().previewTracks).toBeNull()
    projectActions.undo()
    expect(points().map(point => point.bar)).toEqual([1, 9, 17])
  })

  it("recomputes a dragged breakpoint against world time when the viewport autoscrolls", () => {
    const { scene, interaction, pointer, points } = setup()
    const initial = pointer(9, 0.85)
    const gesture = interaction.start(initial)!
    scene.setViewport({ ...scene.get().viewport, scrollX: 48 })
    gesture.move(initial)
    gesture.finish(false)
    expect(points().find(point => point.id === "peak")?.bar).toBe(11)
  })

  it("selects breakpoints by background rectangle without editing the document", () => {
    const { scene, interaction, pointer, points } = setup()
    const before = points().map(point => ({ ...point }))
    const marquee = interaction.start(pointer(1.5, 0.1))!
    marquee.move(pointer(10, 0.95))
    marquee.finish(false)
    expect(scene.get().targetSelection).toMatchObject({ kind: "automation", pointIds: ["peak"] })
    expect(points()).toEqual(before)
  })

  it("materializes a held tail point and an untouched pan lane only when clicked on their line", () => {
    const { scene, interaction, pointer, points } = setup()
    interaction.start(pointer(20, 0.5))?.finish(false)
    expect(points().some(point => point.bar === 20 && point.value === 0.5)).toBe(true)
    projectActions.undo()
    projectActions.setAutomationTarget("3-audio", { kind: "mixer", parameter: "pan" })
    scene.setAutomationDisplay({ "3-audio": { kind: "mixer", parameter: "pan" } }, {}, true)
    const empty = activeAutomationRows(scene.get()).find(item => item.track.id === "3-audio")!
    const x = automationX(scene.get(), 4)
    const y = automationY(empty, automationRowValue(empty, 4))
    const gesture = interaction.start({ ...pointer(4, 0.5), x, y })!
    gesture.finish(false)
    const lane = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")
      ?.automation.find(item => item.target.kind === "mixer" && item.target.parameter === "pan")
    expect(lane?.points.some(point => point.bar === 4)).toBe(true)
  })

  it("keeps two extra lanes target-isolated and hides them without deleting points", () => {
    const { scene, interaction, pointer } = setup()
    const volume = { kind: "mixer", parameter: "volume" } as const
    const pan = { kind: "mixer", parameter: "pan" } as const
    projectActions.setAutomationTarget("3-audio", volume)
    projectActions.addAutomationLane("3-audio")
    projectActions.setAutomationTarget("3-audio", pan)
    projectActions.addAutomationLane("3-audio")
    scene.setAutomationDisplay({ "3-audio": pan }, { "3-audio": [volume, pan] }, true)
    const rows = activeAutomationRows(scene.get()).filter(row => row.track.id === "3-audio")
    expect(rows).toHaveLength(3)
    expect(rows[1].top).toBe(rows[0].bottom)
    expect(rows[2].top).toBe(rows[1].bottom)
    const extraPoint = { ...pointer(9, 0.85), y: automationY(rows[1], 0.85) }
    expect(interaction.contextMenu(extraPoint)).toMatchObject({
      kind: "automation-point",
      laneId: rows[1].laneId,
      pointId: "peak",
      placement: "extra",
    })
    const primaryPoint = { ...pointer(1, 0.25), y: automationY(rows[0], 0.25) }
    expect(interaction.contextMenu(primaryPoint)).toMatchObject({ placement: "primary" })
    const original = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.automation[1].points
    expect(interaction.doubleClick({ ...pointer(5, 0.5), y: automationY(rows[1], 0.15) })).toBe(
      true
    )
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === "3-audio")!
        .automation[0].points.some(point => point.bar === 5)
    ).toBe(true)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!
        .automation[1].points
    ).toEqual(original)
    const hit = interaction.start({ ...pointer(9, 0.85), y: automationY(rows[1], 0.85) })
    expect(hit).not.toBeNull()
    hit?.finish(true)
    projectActions.removeAutomationLane("3-audio", volume)
    scene.setAutomationDisplay({ "3-audio": pan }, { "3-audio": [pan] }, true)
    expect(
      activeAutomationRows(scene.get()).filter(row => row.track.id === "3-audio")
    ).toHaveLength(2)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!
        .automation[0].points
    ).toHaveLength(4)
    scene.setAutomationDisplay({ "3-audio": pan }, { "3-audio": [pan] }, false)
    expect(activeAutomationRows(scene.get())).toEqual([])
  })

  it("deletes a stationary breakpoint and preserves the rest of the envelope", () => {
    const { interaction, pointer, points } = setup()
    interaction.start(pointer(9, 0.85))?.finish(false)
    expect(points().map(point => point.id)).toEqual(["fade-up", "tail"])
    projectActions.undo()
    expect(points().map(point => point.id)).toEqual(["fade-up", "peak", "tail"])
  })

  it("paints each traversed grid cell into a single cancellable document edit", () => {
    const { scene, interaction, pointer, points } = setup()
    projectActions.setMode("drawMode", true)
    const initial = points().map(point => ({ ...point }))
    const cancel = interaction.start(pointer(2.2, 0.2))!
    cancel.move(pointer(6.2, 0.7))
    cancel.finish(true)
    expect(points()).toEqual(initial)
    const gesture = interaction.start(pointer(2.2, 0.2))!
    gesture.move(pointer(6.2, 0.7))
    gesture.finish(false)
    const painted = points()
    expect([2, 3, 4, 5, 6].every(bar => painted.some(point => point.bar === bar))).toBe(true)
    expect(scene.get().previewTracks).toBeNull()
    projectActions.undo()
    expect(points()).toEqual(initial)
  })
  it("snaps a fine-grid automation breakpoint to the same 1/256 cell", () => {
    const { scene, interaction, pointer, points } = setup()
    const cell = 1 / 256
    projectActions.setGrid({ mode: "fixed", bars: cell })
    scene.setMusic({
      bars: 128,
      grid: useProjectState.getState().workspace.grid,
      transport: useProjectState.getState().document.transport,
      media: useProjectState.getState().document.media,
      patterns: useProjectState.getState().document.patterns,
      markers: useProjectState.getState().document.markers,
      loop: useProjectState.getState().document.transport.loop,
      tracks: useProjectState.getState().document.tracks,
    })
    scene.setViewport({ ...scene.get().viewport, pxPerBar: 4096, scrollX: 19 * 4096 })
    expect(interaction.doubleClick(pointer(20 + cell * 1.6, 0.5))).toBe(true)
    expect(points().some(point => point.bar === 20 + cell * 2)).toBe(true)
  })

  it("shifts segment endpoints and bends only its interpolation curve, with cancellation restoring source", () => {
    const { scene, interaction, pointer, points } = setup()
    const start = pointer(5, 0.6)
    const segment = interaction.start(start)!
    segment.move(pointer(5, 0.7))
    segment.finish(false)
    expect(points()[0].value).toBeCloseTo(0.45)
    expect(points()[1].value).toBeCloseTo(0.95)
    projectActions.undo()
    const curved = interaction.start(pointer(5, 0.6, { altKey: true }))!
    curved.move(pointer(5, 0.75, { altKey: true }))
    expect(scene.get().previewTracks).not.toBeNull()
    curved.finish(false)
    expect(points()[0].curve).toBeGreaterThan(0)
    expect(points()[0].value).toBe(0.35)
    projectActions.undo()
    expect(points()[0].curve).toBeUndefined()
  })
})
