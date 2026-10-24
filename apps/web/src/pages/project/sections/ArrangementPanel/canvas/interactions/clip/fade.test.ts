import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { fadeControls } from "@zoeydaw/project-core/fades"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { clipRect, layoutTrackRows } from "@/pages/project/sections/ArrangementPanel/canvas/layout"
import { clipVisualGeometry } from "@/pages/project/sections/ArrangementPanel/canvas/clip-geometry"
import { createFadeGesture } from "./fade"
import { createMoveGesture } from "./move"
import { createResizeGesture } from "./resize"
import type { CanvasPointer } from "../types"
import type { AudioClip } from "@zoeydaw/project-core/types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})

it("drags only fade peaks while keeping quiet offsets fixed; cancel restores the document", () => {
  const initial = useProjectState.getState().document
  const track = initial.tracks.find(item => item.id === "3-audio")
  const clip = track?.clips[0]
  if (!track || clip?.kind !== "audio") {
    throw new Error("Missing audio fixture")
  }
  projectActions.updateClip(clip.id, {
    fadeInOffsetBars: 1,
    fadeInBars: 2,
    fadeOutOffsetBars: 1,
    fadeOutBars: 2,
  })
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
  scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 1200, height: 700, dpr: 1 })
  const pointer: CanvasPointer = {
    x: 300,
    y: 200,
    clientX: 300,
    clientY: 200,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  const current = (): AudioClip => {
    const found = useProjectState.getState().document.tracks.find(item => item.id === track.id)
      ?.clips[0]
    if (found?.kind !== "audio") {
      throw new Error("Missing audio")
    }
    return found
  }
  const before = fadeControls(current(), "in")
  const gesture = createFadeGesture(
    {
      element: document.createElement("div"),
      scene,
      actions: projectActions,
      getState: useProjectState.getState,
    },
    pointer,
    current(),
    "in",
    "length"
  )
  gesture.move({ ...pointer, x: pointer.x + 32 })
  const preview = scene.get().tracks.find(item => item.id === track.id)?.clips[0]
  if (preview?.kind !== "audio") {
    throw new Error("Missing preview")
  }
  expect(fadeControls(preview, "in")).toEqual({ start: before.start, end: before.end + 1 })
  gesture.finish(true)
  expect(scene.get().previewTracks).toBeNull()
  expect(fadeControls(current(), "in")).toEqual(before)

  const out = fadeControls(current(), "out")
  const outGesture = createFadeGesture(
    {
      element: document.createElement("div"),
      scene,
      actions: projectActions,
      getState: useProjectState.getState,
    },
    pointer,
    current(),
    "out",
    "length"
  )
  outGesture.move({ ...pointer, x: pointer.x - 32 })
  outGesture.finish(false)
  expect(fadeControls(current(), "out")).toEqual({ start: out.start - 1, end: out.end })
  const curveGesture = createFadeGesture(
    {
      element: document.createElement("div"),
      scene,
      actions: projectActions,
      getState: useProjectState.getState,
    },
    pointer,
    current(),
    "in",
    "curve"
  )
  curveGesture.move({ ...pointer, y: pointer.y - 8 })
  curveGesture.finish(false)
  expect(current().fadeInCurve).toBeDefined()
  expect(fadeControls(current(), "in")).toEqual(before)
  projectActions.undo()
  expect(current().fadeInCurve).toBeUndefined()
  expect(fadeControls(current(), "out")).toEqual({ start: out.start - 1, end: out.end })
})

it("keeps both quiet fade offsets fixed in the live edge-resize preview", () => {
  projectActions.updateClip("audio-1", {
    fadeInOffsetBars: 1,
    fadeInBars: 2,
    fadeOutOffsetBars: 1,
    fadeOutBars: 2,
  })
  const { tracks } = useProjectState.getState().document
  const clip = tracks.find(track => track.id === "3-audio")?.clips[0]
  if (clip?.kind !== "audio") {
    throw new Error("Missing audio fixture")
  }
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
    tracks,
  })
  scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 1200, height: 700, dpr: 1 })
  const pointer: CanvasPointer = {
    x: 320,
    y: 200,
    clientX: 320,
    clientY: 200,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  const context = {
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  const gesture = createResizeGesture(context, pointer, clip, "left")
  if (!gesture) {
    throw new Error("Missing resize fixture")
  }
  gesture.move({ ...pointer, x: pointer.x + 64 })
  const preview = scene.get().tracks.find(track => track.id === "3-audio")?.clips[0]
  expect(preview).toMatchObject({
    startBar: 3,
    fadeInOffsetBars: 1,
    fadeInBars: 2,
    fadeOutOffsetBars: 1,
    fadeOutBars: 2,
  })
  gesture.finish(false)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")?.clips[0]
  ).toMatchObject({ fadeInOffsetBars: 1, fadeOutOffsetBars: 1 })
})

it("rejects a vanished clip hit without retaining a preview token", () => {
  const track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")
  const clip = track?.clips[0]
  if (!track || !clip) {
    throw new Error("Missing audio fixture")
  }
  const scene = createSceneStore()
  const context = {
    element: document.createElement("div"),
    scene,
    actions: projectActions,
    getState: useProjectState.getState,
  }
  const pointer: CanvasPointer = {
    x: 320,
    y: 200,
    clientX: 320,
    clientY: 200,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  projectActions.deleteClips([clip.id])
  expect(createMoveGesture(context, pointer, track, clip.id, [clip.id])).toBeNull()
  expect(createResizeGesture(context, pointer, clip, "left")).toBeNull()
  expect(useProjectState.getState().session.preview).toBeNull()
  expect(scene.get().previewTracks).toBeNull()
  const token = projectActions.beginPreview()
  expect(token).not.toBeNull()
  projectActions.cancelPreview(token)
})

it.each<{ edge: "in" | "out"; height: number }>([
  { edge: "in", height: 70 },
  { edge: "out", height: 70 },
  { edge: "in", height: 121 },
  { edge: "out", height: 121 },
])(
  "follows pointer travel across the fade body and reverses at its boundary ($edge, $height)",
  ({ edge, height }) => {
    projectActions.updateTrack("3-audio", { heightPx: height, collapsed: false })
    const curveKey = edge === "in" ? "fadeInCurve" : "fadeOutCurve"
    projectActions.updateClip("audio-1", { [curveKey]: 0, fadeInBars: 3, fadeOutBars: 3 })
    const state = useProjectState.getState()
    const track = state.document.tracks.find(item => item.id === "3-audio")!
    const clip = track.clips[0]
    if (clip.kind !== "audio") {
      throw new Error("Missing audio fixture")
    }
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
    scene.setViewport({ pxPerBar: 32, scrollX: 0, scrollY: 0, width: 1200, height: 700, dpr: 1 })
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === track.id)!
    const geometry = clipVisualGeometry(clipRect(clip, row, 32, 0), clip, track, true)
    const fade = geometry.fades.find(item => item.edge === edge)!
    const pointer: CanvasPointer = {
      ...fade.curve,
      clientX: fade.curve.x,
      clientY: fade.curve.y,
      pointerId: 1,
      button: 0,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ctrlKey: false,
    }
    const gesture = createFadeGesture(
      {
        element: document.createElement("div"),
        scene,
        actions: projectActions,
        getState: useProjectState.getState,
      },
      pointer,
      clip,
      edge,
      "curve"
    )
    const previewFade = () => {
      const preview = scene.get().tracks.find(item => item.id === track.id)!.clips[0]
      return clipVisualGeometry(clipRect(preview, row, 32, 0), preview, track, true).fades.find(
        item => item.edge === edge
      )!
    }
    const width = fade.end.x - fade.start.x
    gesture.move({ ...pointer, x: pointer.x + width * 0.2 })
    expect(previewFade().curve.x).toBeCloseTo(pointer.x + width * 0.2)
    expect(previewFade().curve.y).toBeCloseTo(pointer.y)
    gesture.move({ ...pointer, x: pointer.x + width * 2 })
    const rightLimit = fade.end.x - Math.max(7, width * 0.1)
    expect(previewFade().curve.x).toBeCloseTo(rightLimit)
    gesture.move({ ...pointer, x: pointer.x + width * 2 - 1 })
    expect(previewFade().curve.x).toBeCloseTo(rightLimit - 1)
    const travel = geometry.bodyHeight * 0.4
    gesture.move({ ...pointer, y: pointer.y + travel })
    expect(previewFade().curve.y).toBeCloseTo(pointer.y + travel)
    gesture.move({ ...pointer, y: pointer.y + geometry.bodyHeight * 2 })
    expect(previewFade().curve.y).toBeCloseTo(geometry.bodyTop + geometry.bodyHeight * 0.9)
    gesture.move({ ...pointer, y: pointer.y + geometry.bodyHeight * 2 - 1 })
    expect(previewFade().curve.y).toBeCloseTo(geometry.bodyTop + geometry.bodyHeight * 0.9 - 1)
    gesture.finish(false)
    projectActions.undo()
    expect(
      useProjectState.getState().document.tracks.find(item => item.id === track.id)!.clips[0]
    ).toMatchObject({ [curveKey]: 0, fadeInBars: 3, fadeOutBars: 3 })
  }
)
