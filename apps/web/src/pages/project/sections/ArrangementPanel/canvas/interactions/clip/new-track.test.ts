import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import {
  arrangementBodyTop,
  dropZoneTop,
  layoutTrackRows,
  pinnedTopFor,
} from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { createMoveGesture } from "./move"
import type { CanvasPointer } from "../types"

function setup(kind: "audio" | "midi", copy: boolean) {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const track = document.tracks.find(track => track.kind === kind && track.clips.length)
  const main = document.tracks.find(track => track.kind === "main")
  if (!track || !main) throw new Error("Missing fixture tracks")
  track.output = main.id
  document.tracks = [track, main]
  hydrateProject(
    JSON.stringify({
      version: 3,
      document,
      workspace: {
        ...createMockWorkspace(),
        automationMode: true,
        grid: { mode: "fixed", bars: 1 },
      },
    })
  )
  const state = useProjectState.getState()
  const scene = createSceneStore()
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
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 900, dpr: 1 })
  const clip = track.clips[0]
  const pointer: CanvasPointer = {
    x: 30,
    y: arrangementBodyTop() + 4,
    clientX: 30,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: copy,
    metaKey: false,
    ctrlKey: false,
  }
  const context = {
    element: window.document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  const before = useProjectState.getState().document
  const gesture = createMoveGesture(context, pointer, track, clip.id, [clip.id])
  if (!gesture) throw new Error("Missing move gesture")
  const drop = { ...pointer, x: 102, y: dropZoneTop(state.document.tracks, 0) + 8 }
  return { scene, before, gesture, drop, clip, track }
}

it.each([
  ["audio", false],
  ["audio", true],
  ["midi", false],
  ["midi", true],
] satisfies ["audio" | "midi", boolean][])(
  "drops %s clips onto a matching new track atomically (copy %s)",
  (kind, copy) => {
    const { scene, before, gesture, drop, clip, track } = setup(kind, copy)
    gesture.move(drop)
    const first = scene.get().previewTracks
    const ghost = first?.find(item => !before.tracks.some(track => track.id === item.id))
    expect(ghost).toMatchObject({ kind, clips: [{ startBar: 4, lengthBars: clip.lengthBars }] })
    expect(scene.get().clipDrag?.source.find(item => item.id === ghost?.id)?.clips).toEqual([])
    expect(useProjectState.getState().document).toBe(before)
    gesture.move({ ...drop, x: drop.x + 24 })
    gesture.move(drop)
    const projected = scene.get().previewTracks
    expect(projected?.find(item => item.id === ghost?.id)?.clips.map(clip => clip.id)).toEqual(
      ghost?.clips.map(clip => clip.id)
    )
    gesture.finish(false)
    const after = useProjectState.getState().document
    expect(after.tracks.find(item => item.id === ghost?.id)).toEqual(
      projected?.find(item => item.id === ghost?.id)
    )
    expect(
      after.tracks.find(item => item.id === track.id)?.clips.some(item => item.id === clip.id)
    ).toBe(copy)
    expect(after.tracks.at(-1)?.kind).toBe("main")
    expect(after.tracks.at(-2)?.id).toBe(ghost?.id)
    projectActions.undo()
    expect(useProjectState.getState().document).toBe(before)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.redo()
    expect(useProjectState.getState().document).toBe(after)
  }
)

it("cancels the new-track Ghost without leaving a track, clip or history entry", () => {
  const { scene, before, gesture, drop } = setup("audio", false)
  gesture.move(drop)
  expect(scene.get().previewTracks?.length).toBe(before.tracks.length + 1)
  gesture.finish(true)
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(scene.get().previewTracks).toBeNull()
  expect(scene.get().clipDrag).toBeNull()
})

it("does not treat the pinned Main lane as an empty-area new-track destination", () => {
  const { scene, before, gesture, drop } = setup("audio", false)
  gesture.move({ ...drop, y: pinnedTopFor(scene.get().tracks, scene.get().viewport.height) + 4 })
  expect(gesture.cursor).toBe("not-allowed")
  gesture.finish(false)
  expect(useProjectState.getState().document).toBe(before)
  expect(layoutTrackRows(scene.get())).toHaveLength(before.tracks.length)
})

it("preserves relative multiselected track/bar offsets and mixer automation on new-track placement", () => {
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const midi = document.tracks.find(track => track.kind === "midi" && track.clips.length)!
  const audio = document.tracks.find(track => track.kind === "audio")!
  const main = document.tracks.find(track => track.kind === "main")!
  midi.heightPx = audio.heightPx = 80
  midi.clips = [{ ...midi.clips[0], startBar: 2 }]
  audio.clips = [{ ...audio.clips[0], startBar: 4 }]
  audio.automation = [
    {
      id: "source-volume",
      target: { kind: "mixer", parameter: "volume" },
      points: [{ id: "volume-point", bar: 5, value: 0.4 }],
    },
  ]
  midi.output = main.id
  document.tracks = [midi, audio, main]
  hydrateProject(
    JSON.stringify({
      version: 3,
      document,
      workspace: {
        ...createMockWorkspace(),
        automationMode: true,
        grid: { mode: "fixed", bars: 1 },
      },
    })
  )
  const state = useProjectState.getState()
  const scene = createSceneStore()
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
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 900, dpr: 1 })
  const pointer: CanvasPointer = {
    x: 30,
    y: arrangementBodyTop() + 4,
    clientX: 30,
    clientY: 0,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  const context = {
    element: window.document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  const gesture = createMoveGesture(context, pointer, midi, midi.clips[0].id, [
    midi.clips[0].id,
    audio.clips[0].id,
  ])!
  gesture.move({ ...pointer, x: pointer.x + 72, y: dropZoneTop(state.document.tracks, 0) + 8 })
  const added = scene
    .get()
    .previewTracks!.filter(
      track => !state.document.tracks.some(original => original.id === track.id)
    )
  expect(added.map(track => [track.kind, track.clips[0].startBar])).toEqual([
    ["midi", 5],
    ["audio", 7],
  ])
  expect(added[1].automation[0].points).toEqual([{ id: "volume-point", bar: 8, value: 0.4 }])
  gesture.finish(false)
  projectActions.undo()
  expect(useProjectState.getState().document).toBe(state.document)
})
