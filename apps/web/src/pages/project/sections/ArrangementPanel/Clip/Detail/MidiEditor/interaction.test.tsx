// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import { cancelDrawModeKey } from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { ClipDetail } from ".."

function Editor() {
  const clip = useProjectState(state =>
    state.document.tracks.flatMap(track => track.clips).find(item => item.id === "midi-test")
  )
  return clip ? <ClipDetail clip={clip} close={() => {}} /> : null
}

function notes() {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === "midi-test")
  if (clip?.kind !== "midi") {
    throw new Error("Missing MIDI fixture")
  }
  return clip.notes
}

beforeEach(() => {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.id === "trager")
  if (!track) {
    throw new Error("Missing MIDI track")
  }
  track.clips.push({
    id: "midi-test",
    kind: "midi",
    startBar: 1,
    lengthBars: 1,
    sourceOffsetBars: 0.5,
    notes: [
      { id: "retained", pitch: 72, startBeat: 0, lengthBeats: 3, velocity: 90 },
      { id: "visible", pitch: 64, startBeat: 3, lengthBeats: 1, velocity: 80 },
    ],
  })
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  cancelDrawModeKey()
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture")
})

it("draws in source beats using B and commits crossed cells as one undo", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  grid.focus()
  fireEvent.keyDown(grid, { key: "b" })
  expect(useProjectState.getState().session.drawModeOverride).toBe(true)
  fireEvent.pointerDown(grid, { button: 0, pointerId: 1, clientX: 100, clientY: 35 })
  fireEvent.pointerMove(grid, { pointerId: 1, clientX: 175, clientY: 35 })
  fireEvent.pointerUp(grid, { pointerId: 1 })
  const drawn = notes().filter(note => note.pitch === 70 && note.startBeat >= 2)
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.every(note => note.startBeat >= 2)).toBe(true)
  projectActions.undo()
  expect(notes()).toHaveLength(2)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
})

it("cancels note movement on capture loss without changing retained source beats", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  const retained = view.container.querySelector<HTMLElement>('[data-note-index="0"]')
  if (!retained) {
    throw new Error("Missing partially visible note")
  }
  fireEvent.pointerDown(retained, { button: 0, pointerId: 2, clientX: 50, clientY: 30 })
  fireEvent.pointerMove(grid, { pointerId: 2, clientX: 150, clientY: 30 })
  expect(notes()[0].startBeat).not.toBe(0)
  fireEvent.lostPointerCapture(grid, { pointerId: 2 })
  expect(notes()[0].startBeat).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("keeps native name editing shortcuts and routes MIDI selection/delete to notes", () => {
  const view = render(<Editor />)
  const input = view.container.querySelector<HTMLInputElement>("[data-clip-name]")
  if (!input) {
    throw new Error("Missing clip name")
  }
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: "a", metaKey: true })
  expect(notes()).toHaveLength(2)
  fireEvent.blur(input)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  expect(view.container.querySelectorAll('[data-note-index][aria-selected="true"]')).toHaveLength(2)
  fireEvent.keyDown(grid, { key: "Delete" })
  expect(notes()).toHaveLength(0)
  projectActions.undo()
  expect(notes()).toHaveLength(2)
})

it("edits selected velocities as one captured transaction", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  const slider = view.getByRole("slider")
  fireEvent.pointerDown(slider, { pointerId: 3 })
  fireEvent.change(slider, { target: { value: "110" } })
  fireEvent.pointerUp(slider, { pointerId: 3 })
  expect(notes().map(note => note.velocity)).toEqual([110, 110])
  projectActions.undo()
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
})

it("resizes a partially visible source note without discarding its hidden start", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  const edge = view.container.querySelector<HTMLElement>('[data-note-index="0"] [data-note-edge]')
  if (!edge) {
    throw new Error("Missing note resize edge")
  }
  fireEvent.pointerDown(edge, { button: 0, pointerId: 4, clientX: 100, clientY: 30 })
  fireEvent.pointerMove(grid, { pointerId: 4, clientX: 150, clientY: 30 })
  fireEvent.pointerUp(grid, { pointerId: 4 })
  expect(notes()[0].startBeat).toBe(0)
  expect(notes()[0].lengthBeats).toBe(3.5)
  projectActions.undo()
  expect(notes()[0].startBeat).toBe(0)
  expect(notes()[0].lengthBeats).toBe(3)
})

it("erases a note in B mode and rolls back on lost capture", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  grid.focus()
  fireEvent.keyDown(grid, { key: "b" })
  const note = view.container.querySelector<HTMLElement>('[data-note-index="1"]')
  if (!note) {
    throw new Error("Missing note")
  }
  fireEvent.pointerDown(note, { button: 0, pointerId: 5, clientX: 100, clientY: 50 })
  expect(notes()).toHaveLength(1)
  fireEvent.lostPointerCapture(grid, { pointerId: 5 })
  expect(notes()).toHaveLength(2)
})

it("moves Shift-selected notes together and restores both with one undo", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  const first = view.container.querySelector<HTMLElement>('[data-note-index="0"]')
  const second = view.container.querySelector<HTMLElement>('[data-note-index="1"]')
  if (!first || !second) {
    throw new Error("Missing visible notes")
  }
  fireEvent.pointerDown(first, { button: 0, pointerId: 6, clientX: 50, clientY: 30 })
  fireEvent.pointerUp(grid, { pointerId: 6 })
  fireEvent.pointerDown(second, {
    button: 0,
    pointerId: 7,
    shiftKey: true,
    clientX: 120,
    clientY: 50,
  })
  expect(view.container.querySelectorAll('[data-note-index][aria-selected="true"]')).toHaveLength(2)
  fireEvent.pointerDown(second, { button: 0, pointerId: 8, clientX: 120, clientY: 50 })
  fireEvent.pointerMove(grid, { pointerId: 8, clientX: 145, clientY: 50 })
  fireEvent.pointerUp(grid, { pointerId: 8 })
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 3.25])
  projectActions.undo()
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
})

it("copies selected notes through native clipboard and rejects unrelated paste", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  const copied: Record<string, string> = {}
  const clipboardData = {
    setData: (type: string, value: string) => {
      copied[type] = value
    },
    getData: (type: string) => copied[type] ?? "",
  }
  fireEvent.copy(grid, { clipboardData })
  expect(clipboardMemory.read()).toBe(copied["text/plain"])
  const noteText = copied["text/plain"]
  fireEvent.keyDown(grid, { key: "Delete" })
  expect(notes()).toHaveLength(0)
  clipboardData.setData("text/plain", "different application text")
  fireEvent.paste(grid, { clipboardData })
  expect(notes()).toHaveLength(0)
  expect(clipboardMemory.read()).toBe("different application text")
  clipboardData.setData("text/plain", noteText)
  fireEvent.paste(grid, { clipboardData })
  expect(notes()).toHaveLength(2)
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 3.25])
})

it("cuts selected MIDI notes into the shared clipboard with one undo", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  const text: Record<string, string> = {}
  fireEvent.cut(grid, {
    clipboardData: {
      setData(type: string, value: string) {
        text[type] = value
      },
    },
  })
  expect(notes()).toHaveLength(0)
  expect(clipboardMemory.read()).toBe(text["text/plain"])
  projectActions.undo()
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
})

it("duplicates selected notes without changing retained originals", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  fireEvent.keyDown(grid, { key: "d", metaKey: true })
  expect(notes().map(note => note.startBeat)).toEqual([0, 3, 3, 4])
  expect(new Set(notes().map(note => note.id)).size).toBe(4)
  projectActions.undo()
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
})

it("cancels an active note edit on Escape without closing the editor", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 120 }),
    configurable: true,
  })
  const note = view.container.querySelector<HTMLElement>('[data-note-index="1"]')
  if (!note) {
    throw new Error("Missing note")
  }
  fireEvent.pointerDown(note, { button: 0, pointerId: 9, clientX: 100, clientY: 50 })
  fireEvent.pointerMove(grid, { pointerId: 9, clientX: 150, clientY: 50 })
  expect(notes()[1].startBeat).toBe(3.5)
  fireEvent.keyDown(window, { key: "Escape" })
  expect(notes()[1].startBeat).toBe(3)
  expect(view.getByRole("grid")).toBe(grid)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("moves selected notes by keyboard while retaining source-crossing positions", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  fireEvent.keyDown(grid, { key: "ArrowUp" })
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
  expect(notes().map(note => note.pitch)).toEqual([73, 65])
  projectActions.undo()
  expect(notes().map(note => note.pitch)).toEqual([72, 64])
})
