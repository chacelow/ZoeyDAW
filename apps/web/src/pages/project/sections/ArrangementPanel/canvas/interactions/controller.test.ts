import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
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
  vi.restoreAllMocks()
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

it.each(["pointercancel", "lostpointercapture", "blur"])(
  "retains a live title resize on %s",
  interruption => {
    const { element, scene, clip } = createClipController()
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === "3-audio")!
    const y = row.top + 6
    element.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 1, clientY: y, button: 0 })
    )
    element.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 25, clientY: y, button: 0 })
    )
    const live = scene.get().previewTracks?.find(item => item.id === row.track.id)?.clips[0]
    expect(live).toMatchObject({ startBar: 2, sourceOffsetBars: 1 })
    if (interruption === "blur") window.dispatchEvent(new Event("blur"))
    else
      element.dispatchEvent(
        new MouseEvent(interruption, { bubbles: true, clientX: 25, clientY: y })
      )
    expect(clip()).toEqual(live)
    projectActions.undo()
    expect(clip()).toMatchObject({ startBar: 1 })
  }
)

it("prevents extending audio clip edges while allowing a trim", () => {
  projectActions.moveClips(["audio-1"], "3-audio", 4)
  const { pointer, clip } = createClipController()
  const before = clip()
  pointer("pointerdown", 97)
  pointer("pointermove", 49)
  pointer("pointerup", 49)
  expect(clip()).toEqual(before)
  pointer("pointerdown", 479)
  pointer("pointermove", 527)
  pointer("pointerup", 527)
  expect(clip()).toEqual(before)
  pointer("pointerdown", 97)
  pointer("pointermove", 121)
  pointer("pointerup", 121)
  expect(clip()).toMatchObject({ startBar: 6, lengthBars: 15, sourceOffsetBars: 1 })
})

it.each(["Delete", "Backspace"])(
  "%s removes a time range, not its selected whole clip, with one undo",
  key => {
    const { element, scene } = createClipController()
    const before = useProjectState.getState().document
    element.focus()
    projectActions.selectClips(["audio-1"])
    projectActions.setTimeSelection({ startBar: 5, endBar: 9, trackIds: ["3-audio"] })
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    const clips = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!.clips
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({ id: "audio-1", startBar: 1, lengthBars: 4 })
    expect(clips[1]).toMatchObject({ startBar: 9, lengthBars: 8, sourceOffsetBars: 8 })
    expect(scene.get().selectedClipIds.size).toBe(0)
    projectActions.undo()
    expect(useProjectState.getState().document).toEqual(before)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  }
)

it("duplicates the selected audio range immediately after it and supports undo", () => {
  const { element, scene } = createClipController()
  const before = useProjectState.getState().document
  projectActions.selectClips([])
  projectActions.setTimeSelection({ startBar: 5, endBar: 9, trackIds: ["3-audio"] })
  element.focus()
  const event = new KeyboardEvent("keydown", {
    key: "d",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  const clips = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")!.clips
  expect(clips.find(clip => clip.startBar === 9)).toMatchObject({
    lengthBars: 4,
    sourceOffsetBars: 4,
  })
  expect(scene.get().timeSelection).toEqual({ startBar: 9, endBar: 13, trackIds: ["3-audio"] })
  projectActions.undo()
  expect(useProjectState.getState().document).toEqual(before)
})

it("duplicates a selected whole clip when its time selection is collapsed", () => {
  const { element } = createClipController()
  projectActions.selectClips(["audio-1"])
  projectActions.setTimeSelection({ startBar: 5, endBar: 5, trackIds: ["3-audio"] })
  element.focus()
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }))
  const clips = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")!.clips
  expect(clips.find(clip => clip.startBar === 17)).toMatchObject({ lengthBars: 16 })
})

it("uses mac Ctrl-X/V for partial regions and pastes at the live insertion instead of the last pointer", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
  const { element, pointer, scene } = createClipController()
  pointer("pointerdown", 60)
  pointer("pointerup", 60)
  const before = useProjectState.getState().document
  projectActions.selectClips([])
  projectActions.setTimeSelection({ startBar: 5, endBar: 9, trackIds: ["3-audio"] })
  const key = (value: string) => {
    const event = new KeyboardEvent("keydown", {
      key: value,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  key("x")
  const cut = useProjectState.getState().document
  expect(cut.tracks.find(track => track.id === "3-audio")!.clips).toHaveLength(2)
  projectActions.setTimeSelection(null)
  projectActions.setInsertionPoint({ trackId: "3-audio", bar: 25 })
  key("v")
  const pasted = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "3-audio")!.clips
  expect(pasted.at(-1)).toMatchObject({ startBar: 25, lengthBars: 4, sourceOffsetBars: 4 })
  expect(scene.get().timeSelection).toEqual({ startBar: 25, endBar: 29, trackIds: ["3-audio"] })
  projectActions.undo()
  expect(useProjectState.getState().document).toEqual(cut)
  projectActions.undo()
  expect(useProjectState.getState().document).toEqual(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("leaves text input Delete and Ctrl clipboard shortcuts native even with a time selection", () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel")
  const { element } = createClipController()
  const input = document.createElement("input")
  element.append(input)
  input.focus()
  projectActions.selectClips(["audio-1"])
  projectActions.setTimeSelection({ startBar: 5, endBar: 9, trackIds: ["3-audio"] })
  const before = useProjectState.getState().document
  for (const key of ["Delete", "Backspace", "x", "v"]) {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: key.length === 1,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  }
  for (const type of ["copy", "cut", "paste"]) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  }
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("cuts and pastes range content through native clipboard events without requiring selected IDs", () => {
  const { element } = createClipController()
  element.focus()
  projectActions.setTimeSelection({ startBar: 5, endBar: 9, trackIds: ["3-audio"] })
  const before = useProjectState.getState().document
  const data = new Map<string, string>()
  const clipboard = (type: "cut" | "paste") => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (format: string, value: string) => data.set(format, value),
        getData: (format: string) => data.get(format) ?? "",
        get types() {
          return [...data.keys()]
        },
      },
    })
    element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  clipboard("cut")
  const cut = useProjectState.getState().document
  expect(cut.tracks.find(track => track.id === "3-audio")!.clips).toHaveLength(2)
  projectActions.setTimeSelection({ startBar: 25, endBar: 25, trackIds: ["3-audio"] })
  clipboard("paste")
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .clips.at(-1)
  ).toMatchObject({ startBar: 25, lengthBars: 4, sourceOffsetBars: 4 })
  projectActions.undo()
  expect(useProjectState.getState().document).toEqual(cut)
  projectActions.undo()
  expect(useProjectState.getState().document).toEqual(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("does not delete selected whole clips for an empty time range", () => {
  const { element } = createClipController()
  element.focus()
  projectActions.selectClips(["audio-1"])
  projectActions.setTimeSelection({ startBar: 5, endBar: 5, trackIds: ["3-audio"] })
  const before = useProjectState.getState().document
  const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("uses actual edge cursor artwork on hover instead of invalid CSS cursor names", () => {
  const { element, scene } = createClipController()
  const snapshot = scene.get()
  const row = layoutTrackRows(snapshot).find(item => item.track.id === "3-audio")!
  const clip = row.track.clips[0]
  const left = (clip.startBar - 1) * snapshot.viewport.pxPerBar - snapshot.viewport.scrollX
  element.dispatchEvent(
    new MouseEvent("pointermove", { bubbles: true, clientX: left + 1, clientY: row.top + 6 })
  )
  expect(element.style.cursor).toContain("--arrangement-brace-left-cursor")
  element.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX: left + clip.lengthBars * snapshot.viewport.pxPerBar - 1,
      clientY: row.top + 6,
    })
  )
  expect(element.style.cursor).toContain("--arrangement-brace-right-cursor")
  element.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX: left + 1,
      clientY: row.top + row.contentHeight / 2,
    })
  )
  expect(element.style.cursor).not.toContain("brace")
})
