import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { createSceneStore } from "../scene"
import { layoutTrackRows } from "../layout"
import { createCanvasController } from "./controller"

let dispose: (() => void) | undefined
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
  dispose?.()
  document.body.replaceChildren()
})

it("does not duplicate a hidden clip selection after switching to automation mode", () => {
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
    tracks: state.document.tracks,
  })
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 700, dpr: 1 })
  const element = document.createElement("div")
  element.tabIndex = 0
  document.body.append(element)
  const controller = createCanvasController(
    { element, scene, actions: projectActions, getState: useProjectState.getState },
    () => {}
  )
  dispose = controller.dispose
  const titleY = layoutTrackRows(scene.get()).find(row => row.track.id === "3-audio")!.top + 6
  element.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, clientX: 60, clientY: titleY, button: 0 })
  )
  element.dispatchEvent(
    new MouseEvent("pointerup", { bubbles: true, clientX: 60, clientY: titleY, button: 0 })
  )
  expect(useProjectState.getState().session.selectedClipIds).toEqual(["audio-1"])
  projectActions.setMode("automationMode", true)
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "d",
      code: "KeyD",
      ctrlKey: true,
    })
  )
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .clips.map(clip => clip.id)
  ).toEqual(["audio-1"])
})

function createClipController() {
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
    tracks: state.document.tracks,
  })
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 700, dpr: 1 })
  const element = document.createElement("div")
  element.tabIndex = 0
  document.body.append(element)
  dispose = createCanvasController(
    { element, scene, actions: projectActions, getState: useProjectState.getState },
    () => {}
  ).dispose
  const titleY = layoutTrackRows(scene.get()).find(row => row.track.id === "3-audio")!.top + 6
  const pointer = (type: string, x: number, y = titleY) =>
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
    )
  const clip = () =>
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .clips.find(item => item.id === "audio-1")
  return { scene, element, pointer, clip }
}

it("moves an audio clip by its title in automation mode and undoes in one step", () => {
  const { scene, element, pointer, clip } = createClipController()
  projectActions.setMode("automationMode", true)
  const row = layoutTrackRows(scene.get()).find(item => item.track.id === "3-audio")!
  const titleY = row.top + 7
  pointer("pointermove", 60, titleY)
  expect(element.style.cursor).toBe("grab")
  pointer("pointerdown", 60, titleY)
  pointer("pointermove", 84, titleY)
  expect(scene.get().previewTracks?.find(track => track.id === "3-audio")?.clips[0]).toMatchObject({
    startBar: 2,
  })
  pointer("pointerup", 108, titleY)
  expect(clip()).toMatchObject({ startBar: 3 })
  expect(scene.get().previewTracks).toBeNull()
  projectActions.undo()
  expect(clip()).toMatchObject({ startBar: 1 })
})

it("keeps clip bodies and empty track lanes available for automation editing", () => {
  const { scene, element, pointer, clip } = createClipController()
  projectActions.setMode("automationMode", true)
  scene.setAutomationDisplay({}, {}, true)
  const row = layoutTrackRows(scene.get()).find(item => item.track.id === "3-audio")!
  const bodyY = row.top + 60
  const lane = () =>
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.automation[0]
  const originalCount = lane().points.length
  pointer("pointerdown", 120, bodyY)
  pointer("pointermove", 144, bodyY + 10)
  pointer("pointerup", 144, bodyY + 10)
  expect(clip()).toMatchObject({ startBar: 1 })
  expect(scene.get().targetSelection.kind).toBe("automation")
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 120, clientY: bodyY }))
  expect(lane().points).toHaveLength(originalCount + 1)
  pointer("pointerdown", 500, bodyY)
  pointer("pointermove", 520, bodyY + 8)
  pointer("pointerup", 520, bodyY + 8)
  expect(scene.get().targetSelection.kind).toBe("automation")
  expect(clip()).toMatchObject({ startBar: 1 })
})

it("copies a clip from its title in automation mode without moving the original", () => {
  const { scene, element, clip } = createClipController()
  projectActions.setMode("automationMode", true)
  const row = layoutTrackRows(scene.get()).find(item => item.track.id === "3-audio")!
  const y = row.top + 7
  for (const [type, x] of [
    ["pointerdown", 60],
    ["pointermove", 84],
    ["pointerup", 84],
  ] as const) {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, altKey: true })
    )
  }
  const { clips } = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")!
  expect(clip()).toMatchObject({ startBar: 1 })
  expect(clips).toHaveLength(2)
  expect(clips.find(item => item.id !== "audio-1")).toMatchObject({ startBar: 2 })
  projectActions.undo()
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.clips
  ).toHaveLength(1)
})

it.each(["pointercancel", "lostpointercapture", "blur"])(
  "commits the last valid clip preview on %s after leaving the canvas",
  interruption => {
    const { scene, element, pointer, clip } = createClipController()
    pointer("pointerdown", 60)
    pointer("pointermove", 84)
    expect(
      scene.get().previewTracks?.find(track => track.id === "3-audio")?.clips[0]
    ).toMatchObject({ startBar: 2 })
    pointer("pointermove", 130, -30)
    expect(
      scene.get().previewTracks?.find(track => track.id === "3-audio")?.clips[0]
    ).toMatchObject({ startBar: 2 })
    if (interruption === "blur") {
      window.dispatchEvent(new Event("blur"))
    } else {
      element.dispatchEvent(
        new MouseEvent(interruption, { bubbles: true, clientX: 130, clientY: -30 })
      )
    }
    expect(clip()).toMatchObject({ startBar: 2 })
    expect(scene.get().previewTracks).toBeNull()
    projectActions.undo()
    expect(clip()).toMatchObject({ startBar: 1 })
  }
)

it("continues moving through modifier keys and commits final pointerup coordinates", () => {
  const { element, pointer, clip } = createClipController()
  pointer("pointerdown", 60)
  pointer("pointermove", 84)
  for (const key of ["Shift", "Alt", "Control", "Meta"]) {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }))
  }
  pointer("pointerup", 108)
  expect(clip()).toMatchObject({ startBar: 3 })
  projectActions.undo()
  expect(clip()).toMatchObject({ startBar: 1 })
})

it("Escape cancels a started clip drag despite its valid preview", () => {
  const { scene, element, pointer, clip } = createClipController()
  pointer("pointerdown", 60)
  pointer("pointermove", 84)
  expect(scene.get().previewTracks).not.toBeNull()
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }))
  expect(scene.get().previewTracks).toBeNull()
  pointer("pointerup", 108)
  expect(clip()).toMatchObject({ startBar: 1 })
})

it("does not commit a clip gesture interrupted before drag threshold", () => {
  const { pointer, clip } = createClipController()
  pointer("pointerdown", 60)
  pointer("lostpointercapture", 60)
  expect(clip()).toMatchObject({ startBar: 1 })
})
