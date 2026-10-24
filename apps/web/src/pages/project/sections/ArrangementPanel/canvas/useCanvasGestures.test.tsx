import { DEFAULT_TRACK_HEIGHT, TRACK_TITLE_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import {
  hydrateProject,
  projectActions,
  startProjectRuntime,
  useProjectState,
} from "@/pages/project/adapters"
import {
  createMockDocument,
  createMockWorkspace,
  createMockProjectBackend,
} from "@zoeydaw/project-runtime/testing"
import { useArrangementKeyboard } from "../Timeline/useArrangementKeyboard"
import { arrangementScene } from "./scene"
import { layoutTrackRows, clipRect } from "./layout"
import { useCanvasGestures } from "./useCanvasGestures"
import { configureProjectBackend } from "@/pages/project/adapters/context"

let releaseRuntime: (() => void) | undefined

function Canvas() {
  const reference = useRef<HTMLDivElement>(null)
  useCanvasGestures(reference)
  return <div ref={reference} data-testid="host" data-arrangement-canvas-host />
}

function KeyboardCanvas() {
  const reference = useRef<HTMLDivElement>(null)
  useCanvasGestures(reference)
  useArrangementKeyboard()
  return (
    <div
      ref={reference}
      data-testid="host"
      data-arrangement-canvas-host
      role="application"
      aria-label="Arrangement canvas keyboard surface"
      tabIndex={0}
    />
  )
}

function pointFor(id: string, xOffset: number, yOffset: number) {
  const scene = arrangementScene.get()
  const row = layoutTrackRows(scene).find(row => row.track.clips.some(clip => clip.id === id))
  if (!row) {
    throw new Error(`No visible clip ${id}`)
  }
  const clip = row.track.clips.find(clip => clip.id === id)
  if (!clip) {
    throw new Error(`No clip ${id}`)
  }
  const rect = clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
  return { clientX: rect.left + xOffset, clientY: rect.top + yOffset, pointerId: 7, button: 0 }
}

function clipById(id: string) {
  return useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === id)
}

beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
  const state = useProjectState.getState()
  arrangementScene.setProjectPreview(null)
  arrangementScene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  arrangementScene.setViewport({
    pxPerBar: 32,
    scrollX: 0,
    scrollY: 0,
    width: 1600,
    height: 900,
    dpr: 1,
  })
  arrangementScene.setSelection(new Set())
  arrangementScene.setTimeSelection(null)
  HTMLElement.prototype.setPointerCapture = function () {
    this.dataset.captured = "true"
  }
  HTMLElement.prototype.hasPointerCapture = function () {
    return this.dataset.captured === "true"
  }
  HTMLElement.prototype.releasePointerCapture = function () {
    delete this.dataset.captured
  }
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900 }),
  })
})
afterEach(() => {
  cleanup()
  releaseRuntime?.()
  releaseRuntime = undefined
  arrangementScene.setProjectPreview(null)
})

describe("canvas clip gestures", () => {
  it("uses Ctrl+E only to split selected clips; no selection leaves grid unchanged", () => {
    const host = render(<KeyboardCanvas />).getByTestId("host")
    projectActions.selectClips(["audio-1"])
    projectActions.seekBar(9)
    host.focus()
    fireEvent.keyDown(host, { key: "e", code: "KeyE", ctrlKey: true })
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "medium",
    })
    expect(clipById("audio-1")?.lengthBars).toBe(8)
    projectActions.selectClips([])
    fireEvent.keyDown(host, { key: "e", code: "KeyE", ctrlKey: true })
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "medium",
    })
  })

  it("copies once after multiple Alt pointer moves and undoes as one entry", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const start = pointFor("audio-1", 24, 7)
    const original = clipById("audio-1")
    if (!original) {
      throw new Error("Missing audio fixture")
    }
    const baseline = useProjectState.getState().document.tracks.flatMap(track => track.clips).length
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 32, altKey: true })
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64, altKey: true })
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 96, altKey: true })
    })
    expect(useProjectState.getState().document.tracks.flatMap(track => track.clips)).toHaveLength(
      baseline
    )
    expect(arrangementScene.get().previewTracks).not.toBeNull()
    act(() => fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 96, altKey: true }))
    const clips = useProjectState.getState().document.tracks.flatMap(track => track.clips)
    expect(clips).toHaveLength(baseline + 1)
    expect(clipById("audio-1")?.startBar).toBe(original.startBar)
    projectActions.undo()
    expect(useProjectState.getState().document.tracks.flatMap(track => track.clips)).toHaveLength(
      baseline
    )
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("keeps a trimmed left edge anchored at pointer-down offset, with source intact on cancel", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const edge = pointFor("audio-1", 3, 50)
    const original = clipById("audio-1")
    if (!original) {
      throw new Error("Missing audio fixture")
    }
    act(() => {
      fireEvent.pointerDown(host, edge)
      fireEvent.pointerMove(host, { ...edge, clientX: edge.clientX + 2 })
    })
    expect(arrangementScene.get().previewTracks).toBeNull()
    act(() => fireEvent.pointerMove(host, { ...edge, clientX: edge.clientX + 35 }))
    const preview = arrangementScene
      .get()
      .tracks.flatMap(track => track.clips)
      .find(clip => clip.id === "audio-1")
    expect(preview?.startBar).toBe(original.startBar + 1)
    expect(preview?.sourceOffsetBars).toBe((original.sourceOffsetBars ?? 0) + 1)
    expect(clipById("audio-1")).toEqual(original)
    act(() => fireEvent.pointerCancel(host, { ...edge, pointerId: 99 }))
    expect(arrangementScene.get().previewTracks).not.toBeNull()
    act(() => fireEvent.pointerCancel(host, edge))
    expect(arrangementScene.get().previewTracks).toBeNull()
    expect(clipById("audio-1")).toEqual(original)
  })

  it("preserves selected multi-clip relative placement and ignores another pointer's release", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const track = useProjectState
      .getState()
      .document.tracks.find(track => track.clips.some(clip => clip.id === "audio-1"))
    if (!track) {
      throw new Error("Missing audio fixture")
    }
    projectActions.createClip(track.id, "audio", 20, 2)
    const added = useProjectState
      .getState()
      .document.tracks.find(item => item.id === track.id)
      ?.clips.at(-1)
    if (!added) {
      throw new Error("Missing new clip")
    }
    arrangementScene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 1 },
      transport: useProjectState.getState().document.transport,
      media: useProjectState.getState().document.media,
      patterns: useProjectState.getState().document.patterns,
      markers: useProjectState.getState().document.markers,
      loop: useProjectState.getState().document.transport.loop,
      tracks: useProjectState.getState().document.tracks,
    })
    projectActions.selectClips(["audio-1", added.id])
    arrangementScene.setSelection(new Set(["audio-1", added.id]))
    const start = pointFor("audio-1", 24, 7)
    const originalA = clipById("audio-1")!.startBar
    const originalB = clipById(added.id)!.startBar
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64 })
      fireEvent.pointerUp(host, { ...start, pointerId: 99 })
    })
    expect(clipById("audio-1")?.startBar).toBe(originalA)
    act(() => fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 64 }))
    expect(clipById("audio-1")?.startBar).toBe(originalA + 2)
    expect(clipById(added.id)?.startBar).toBe(originalB + 2)
  })

  it("rejects a cross-kind target and accepts a compatible audio lane", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const baseline = clipById("audio-1")?.startBar
    const start = pointFor("audio-1", 24, 7)
    const midiRow = layoutTrackRows(arrangementScene.get()).find(row => row.track.id === "4-midi")
    if (!midiRow) {
      throw new Error("Missing midi row")
    }
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, {
        ...start,
        clientX: start.clientX + 64,
        clientY: midiRow.top + 30,
      })
      fireEvent.pointerUp(host, {
        ...start,
        clientX: start.clientX + 64,
        clientY: midiRow.top + 30,
      })
    })
    expect(clipById("audio-1")?.startBar).toBe(baseline)
    projectActions.addTrack("audio")
    const target = useProjectState
      .getState()
      .document.tracks.find(track => track.kind === "audio" && track.id !== "3-audio")
    if (!target) {
      throw new Error("Missing new audio lane")
    }
    const state = useProjectState.getState()
    arrangementScene.setMusic({
      bars: 128,
      grid: state.workspace.grid,
      transport: state.document.transport,
      media: state.document.media,
      patterns: state.document.patterns,
      markers: state.document.markers,
      loop: state.document.transport.loop,
      tracks: state.document.tracks,
    })
    const row = layoutTrackRows(arrangementScene.get()).find(row => row.track.id === target.id)
    if (!row) {
      throw new Error("Missing target row")
    }
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64, clientY: row.top + 30 })
      fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 64, clientY: row.top + 30 })
    })
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === target.id)
        ?.clips.some(clip => clip.id === "audio-1")
    ).toBe(true)
    expect(clipById("audio-1")?.startBar).toBe((baseline ?? 0) + 2)
  })

  it("selects the existing clip without opening detail on stationary click or double click", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const title = pointFor("audio-1", 24, 7)
    act(() => {
      fireEvent.pointerDown(host, title)
      fireEvent.pointerUp(host, title)
    })
    expect(useProjectState.getState().session.selectedClipIds).toEqual(["audio-1"])
    expect(useProjectState.getState().session.clipEditorRequest).toBe(0)
    act(() => fireEvent.doubleClick(host, { clientX: title.clientX, clientY: title.clientY }))
    expect(useProjectState.getState().session.selectedClipIds).toEqual(["audio-1"])
    expect(useProjectState.getState().session.clipEditorRequest).toBe(0)
  })

  it("selects and opens a newly created clip on an empty lane double click", () => {
    const host = render(<Canvas />).getByTestId("host")
    const scene = arrangementScene.get()
    const row = layoutTrackRows(scene).find(item => item.track.id === "3-audio")
    if (!row) {
      throw new Error("Missing audio lane")
    }
    const before = useProjectState.getState().session.clipEditorRequest
    act(() =>
      fireEvent.doubleClick(host, { clientX: 640, clientY: row.top + TRACK_TITLE_HEIGHT + 12 })
    )
    const state = useProjectState.getState()
    const created = state.document.tracks.find(track => track.id === "3-audio")?.clips.at(-1)
    expect(created).toBeDefined()
    expect(state.session.selectedClipIds).toEqual([created?.id])
    expect(state.session.clipEditorRequest).toBe(before + 1)
  })

  it("toggles clip selection with modifiers without starting a document gesture", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const first = pointFor("audio-1", 24, 7)
    const second = pointFor("trager-1", 24, 7)
    act(() => {
      fireEvent.pointerDown(host, first)
      fireEvent.pointerUp(host, first)
      fireEvent.pointerDown(host, { ...second, shiftKey: true })
      fireEvent.pointerDown(host, { ...first, shiftKey: true })
    })
    expect(useProjectState.getState().session.selectedClipIds).toEqual(["trager-1"])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  it("selects musical time from clip body and restores it on Escape", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const start = pointFor("audio-1", 40, 32)
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64 })
    })
    expect(arrangementScene.get().timeSelection?.endBar).toBeGreaterThan(
      arrangementScene.get().timeSelection?.startBar ?? 0
    )
    act(() => fireEvent.keyDown(window, { key: "Escape" }))
    expect(arrangementScene.get().timeSelection).toBeNull()
    expect(useProjectState.getState().session.timeSelection).toBeNull()
  })
  it("retains the last move on capture loss as one undoable change", () => {
    const { getByTestId } = render(<Canvas />)
    const host = getByTestId("host")
    const start = pointFor("audio-1", 24, 7)
    const original = clipById("audio-1")?.startBar
    act(() => {
      fireEvent.pointerDown(host, start)
      fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64 })
      fireEvent.lostPointerCapture(host, start)
    })
    expect(arrangementScene.get().previewTracks).toBeNull()
    expect(clipById("audio-1")?.startBar).toBe((original ?? 0) + 2)
    expect(useProjectState.getState().session.canUndo).toBe(true)
    act(() => projectActions.undo())
    expect(clipById("audio-1")?.startBar).toBe(original)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
})

it("adjusts a fade from its grabbed length without snapping the handle to the pointer", () => {
  const host = render(<Canvas />).getByTestId("host")
  const start = pointFor("audio-1", 12, TRACK_TITLE_HEIGHT + 1)
  act(() => {
    fireEvent.pointerMove(host, start)
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 4 })
  })
  const preview = arrangementScene
    .get()
    .tracks.flatMap(track => track.clips)
    .find(clip => clip.id === "audio-1")
  expect(preview?.kind === "audio" ? preview.fadeInBars : null).toBeCloseTo(0.375)
  act(() => fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 4 }))
  const committed = clipById("audio-1")
  expect(committed?.kind === "audio" ? committed.fadeInBars : null).toBeCloseTo(0.375)
})

it("clamps a selected group at the project start without collapsing its relative spacing in preview", () => {
  const host = render(<Canvas />).getByTestId("host")
  projectActions.createClip("3-audio", "audio", 20, 2)
  const state = useProjectState.getState()
  const added = state.document.tracks.find(track => track.id === "3-audio")?.clips.at(-1)
  if (!added) {
    throw new Error("Missing selected clip")
  }
  arrangementScene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  projectActions.selectClips(["audio-1", added.id])
  const start = pointFor(added.id, 24, 7)
  act(() => {
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX - 64 })
  })
  const preview = arrangementScene.get().tracks.flatMap(track => track.clips)
  expect(preview.find(clip => clip.id === added.id)?.startBar).toBe(20)
  expect(preview.find(clip => clip.id === "audio-1")?.startBar).toBe(1)
  act(() => fireEvent.pointerUp(host, { ...start, clientX: start.clientX - 64 }))
  expect(clipById(added.id)?.startBar).toBe(20)
})

it("selects a time rectangle across track bodies without moving source clips", () => {
  const host = render(<Canvas />).getByTestId("host")
  const start = pointFor("trager-1", 40, 32)
  const end = pointFor("audio-1", 104, 32)
  act(() => {
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, end)
    fireEvent.pointerUp(host, end)
  })
  expect(useProjectState.getState().session.timeSelection?.trackIds).toEqual([
    "trager",
    "sidechain",
    "3-audio",
  ])
  expect(clipById("trager-1")?.startBar).toBe(1)
  expect(clipById("audio-1")?.startBar).toBe(1)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("toggles playback during a clip drag without cancelling its live preview", () => {
  const host = render(<KeyboardCanvas />).getByTestId("host")
  const start = pointFor("audio-1", 24, 7)
  act(() => {
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 64 })
  })
  const preview = arrangementScene.get().previewTracks
  expect(preview).not.toBeNull()
  act(() => fireEvent.keyDown(window, { key: " ", code: "Space" }))
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(arrangementScene.get().previewTracks).toBe(preview)
  expect(clipById("audio-1")?.startBar).toBe(1)
  act(() => fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 64 }))
  expect(clipById("audio-1")?.startBar).toBe(3)
})

it("retains recorded notes when a clip drag returns to its origin and continues", () => {
  releaseRuntime = startProjectRuntime()
  const host = render(<Canvas />).getByTestId("host")
  const start = pointFor("audio-1", 24, 7)
  act(() => {
    projectActions.toggleRecording()
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 128 })
    projectActions.noteOn(82)
    fireEvent.pointerMove(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 256 })
    fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 256 })
  })
  expect(clipById("audio-1")?.startBar).toBe(9)
  expect(clipById("trager-1")).toMatchObject({
    notes: expect.arrayContaining([expect.objectContaining({ pitch: 82 })]),
  })
})

it("cancels an active canvas drag when a new project reuses track IDs", () => {
  const host = render(<Canvas />).getByTestId("host")
  const start = pointFor("audio-1", 24, 7)
  act(() => {
    fireEvent.pointerDown(host, start)
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 128 })
    fireEvent.pointerMove(host, start)
  })
  act(() => {
    const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
    document.name = "New session"
    document.tracks = document.tracks.map(track => ({ ...track, clips: [] }))
    hydrateProject(JSON.stringify({ version: 3, document, workspace: createMockWorkspace() }))
  })
  act(() => {
    fireEvent.pointerMove(host, { ...start, clientX: start.clientX + 256 })
    fireEvent.pointerUp(host, { ...start, clientX: start.clientX + 256 })
  })
  expect(useProjectState.getState().document.name).toBe("New session")
  expect(useProjectState.getState().document.tracks.flatMap(track => track.clips)).toEqual([])
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("does not restore an old ruler seek into a newly hydrated project", () => {
  const host = render(<Canvas />).getByTestId("host")
  act(() => {
    projectActions.seekBar(20)
    fireEvent.pointerDown(host, { clientX: 320, clientY: 25, pointerId: 7, button: 0 })
    fireEvent.pointerMove(host, { clientX: 384, clientY: 25, pointerId: 7, button: 0 })
  })
  expect(useProjectState.getState().session.position.bar).not.toBe(20)
  act(() => projectActions.stop())
  act(() =>
    hydrateProject(
      JSON.stringify({
        version: 3,
        document: createMockDocument(DEFAULT_TRACK_HEIGHT),
        workspace: createMockWorkspace(),
      })
    )
  )
  act(() => fireEvent.pointerCancel(host, { clientX: 384, clientY: 25, pointerId: 7, button: 0 }))
  expect(useProjectState.getState().session.position.bar).toBe(1)
  expect(useProjectState.getState().session.insertionPoint).toBeNull()
})
