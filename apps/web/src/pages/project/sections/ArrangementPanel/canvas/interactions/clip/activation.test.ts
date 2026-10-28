import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { createClipInteractions } from "."
import type { CanvasPointer } from "../types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: { ...createMockWorkspace(), grid: { mode: "fixed", bars: 1 } },
    })
  )
})

it("selects and opens existing cards and newly created cards", () => {
  const scene = createSceneStore()
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
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 700, dpr: 1 })
  const interaction = createClipInteractions({
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  })
  const pointer = (trackId: string): CanvasPointer => ({
    x: 60,
    y: layoutTrackRows(scene.get()).find(row => row.track.id === trackId)!.top + 4,
    clientX: 60,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  })
  expect(interaction.hover(pointer("trager"))).toBe("grab")
  interaction.start(pointer("trager"))?.finish(false)
  expect(useProjectState.getState().session.clipEditorRequest).toBe(0)
  expect(interaction.doubleClick(pointer("trager"))).toBe(true)
  expect(useProjectState.getState().session.selectedClipIds).toEqual(["trager-1"])
  expect(useProjectState.getState().session.editingClipId).toBe("trager-1")
  expect(useProjectState.getState().session.clipEditorRequest).toBe(1)
  const audioId = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")
    ?.clips.find(clip => clip.kind === "audio")?.id
  if (!audioId) throw new Error("Missing audio fixture")
  expect(interaction.doubleClick({ ...pointer("3-audio"), x: 60, clientX: 60 })).toBe(true)
  expect(useProjectState.getState().session.editingClipId).toBe(audioId)
  expect(useProjectState.getState().session.clipEditorRequest).toBe(2)
  expect(interaction.doubleClick({ ...pointer("3-audio"), x: 500, clientX: 500 })).toBe(false)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.clips
  ).toHaveLength(1)
  projectActions.setTimeSelection({ startBar: 3, endBar: 7, trackIds: ["4-midi"] })
  expect(interaction.doubleClick(pointer("4-midi"))).toBe(true)
  const created = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
    .clips[0]
  expect(created).toMatchObject({ kind: "midi", startBar: 3, lengthBars: 4, loopBars: 4 })
  projectActions.resizeClip(created.id, "right", 11)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!.clips[0]
  ).toMatchObject({ lengthBars: 8, loopBars: 4 })
  expect(useProjectState.getState().session.selectedClipIds).toEqual([created.id])
  expect(useProjectState.getState().session.clipEditorRequest).toBe(3)
  expect(interaction.keyDown(new KeyboardEvent("keydown", { key: "r", ctrlKey: true }))).toBe(true)
  expect(scene.get().targetSelection).toEqual({ kind: "clip", id: created.id, phase: "renaming" })
  expect(useProjectState.getState().session.clipEditorRequest).toBe(3)
})

it("retains the last compatible multi-clip preview across incompatible and absent destinations", () => {
  const scene = createSceneStore()
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
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 700, dpr: 1 })
  const interaction = createClipInteractions({
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  })
  projectActions.selectClips(["trager-1", "audio-1"])
  const pointer: CanvasPointer = {
    x: 60,
    y: layoutTrackRows(scene.get()).find(row => row.track.id === "trager")!.top + 4,
    clientX: 60,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  const gesture = interaction.start(pointer)
  if (!gesture) {
    throw new Error("Missing move gesture")
  }
  gesture.move({ ...pointer, x: 84 })
  const preview = scene.get().previewTracks
  expect(preview?.find(track => track.id === "trager")?.clips[0]).toMatchObject({ startBar: 2 })
  expect(preview?.find(track => track.id === "3-audio")?.clips[0]).toMatchObject({ startBar: 2 })
  const incompatibleY =
    layoutTrackRows(scene.get()).find(row => row.track.id === "sidechain")!.top + 4
  gesture.move({ ...pointer, x: 108, y: incompatibleY })
  expect(gesture.cursor).toBe("not-allowed")
  expect(scene.get().previewTracks).toBe(preview)
  gesture.move({ ...pointer, x: 132, y: -30 })
  expect(scene.get().previewTracks).toBe(preview)
  gesture.finish(false)
  expect(scene.get().previewTracks).toBeNull()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({ startBar: 2 })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")?.clips[0]
  ).toMatchObject({ startBar: 2 })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "4-midi")?.clips
  ).toEqual([])
  projectActions.undo()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")?.clips[0]
  ).toMatchObject({ startBar: 1 })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")?.clips[0]
  ).toMatchObject({ startBar: 1 })
})

it("toggles clip mute from the 0 key and commits one undoable edit", () => {
  const scene = createSceneStore()
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
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 700, dpr: 1 })
  const interaction = createClipInteractions({
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  })
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.kind === "audio")!
  projectActions.selectClips([clip.id])
  expect(interaction.keyDown(new KeyboardEvent("keydown", { key: "0" }))).toBe(true)
  const muted = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === clip.id)
  expect(muted?.mute).toBe(true)
  interaction.keyDown(new KeyboardEvent("keydown", { key: "0" }))
  const unmuted = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === clip.id)
  expect(unmuted?.mute).toBe(false)
  projectActions.undo()
  const restored = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === clip.id)
  expect(restored?.mute).toBe(true)
})
