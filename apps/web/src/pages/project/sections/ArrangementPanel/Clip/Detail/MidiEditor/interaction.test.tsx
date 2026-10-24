import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import { cancelDrawModeKey } from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { useMidiKeyboard } from "@/pages/project/sections/ArrangementPanel/Timeline/useMidiKeyboard"
import { ClipDetail } from ".."
import { MidiEditor } from "."

function Editor() {
  const clip = useProjectState(state =>
    state.document.tracks.flatMap(track => track.clips).find(item => item.id === "midi-test")
  )
  return clip ? <ClipDetail clip={clip} /> : null
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
  const document = createMockDocument(DEFAULT_TRACK_HEIGHT)
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
  hydrateProject(JSON.stringify({ version: 4, document, workspace: createMockWorkspace() }))
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

for (const value of ["", "not a number", "Infinity", "0", "-1"]) {
  it(`does not publish an invalid MIDI loop length ${JSON.stringify(value)}`, () => {
    const view = render(<Editor />)
    const document = useProjectState.getState().document
    fireEvent.change(view.getByRole("spinbutton", { name: "detailMidi.loopBars" }), {
      target: { value },
    })
    expect(useProjectState.getState().document).toBe(document)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
}

for (const value of ["", "not a number", "Infinity"]) {
  it(`does not publish an invalid selected velocity ${JSON.stringify(value)}`, () => {
    const view = render(<Editor />)
    const grid = view.getByRole("grid")
    grid.focus()
    fireEvent.keyDown(grid, { key: "a", metaKey: true })
    const document = useProjectState.getState().document
    fireEvent.change(view.getByRole("spinbutton", { name: "detailMidi.selectedVelocity" }), {
      target: { value },
    })
    expect(useProjectState.getState().document).toBe(document)
    expect(notes().map(note => note.velocity)).toEqual([90, 80])
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
}

it("draws in source beats using B and commits crossed cells as one undo", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  grid.focus()
  fireEvent.keyDown(grid, { key: "b" })
  expect(useProjectState.getState().session.drawModeOverride).toBe(true)
  fireEvent.pointerDown(grid, {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: (127 - 70 + 0.5) * 18,
  })
  fireEvent.pointerMove(grid, { pointerId: 1, clientX: 175, clientY: (127 - 70 + 0.5) * 18 })
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
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
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
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
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
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
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
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
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
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
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

it("draws both extreme MIDI pitches without changing retained source notes", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  fireEvent.doubleClick(grid, { clientX: 200, clientY: 9 })
  fireEvent.doubleClick(grid, { clientX: 250, clientY: 128 * 18 - 9 })
  expect(
    notes()
      .slice(2)
      .map(note => note.pitch)
  ).toEqual([127, 0])
  expect(
    notes()
      .slice(0, 2)
      .map(note => note.startBeat)
  ).toEqual([0, 3])
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  expect(view.container.querySelectorAll('[data-note-index][aria-selected="true"]')).toHaveLength(4)
})

it("marquee-selects note intersections and cancels an unfinished selection", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  fireEvent.pointerDown(grid, { button: 0, pointerId: 20, clientX: 0, clientY: (127 - 73) * 18 })
  fireEvent.pointerMove(grid, { pointerId: 20, clientX: 90, clientY: (127 - 71) * 18 })
  expect(view.container.querySelectorAll('[data-note-index][aria-selected="true"]')).toHaveLength(1)
  fireEvent.lostPointerCapture(grid, { pointerId: 20 })
  expect(view.container.querySelectorAll('[data-note-index][aria-selected="true"]')).toHaveLength(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("edits individual lane velocities and cancels capture loss", () => {
  const view = render(<Editor />)
  const lane = view.container.querySelector<HTMLElement>(
    '[aria-label][style*="height: 68px"] button'
  )
  if (!lane) throw new Error("Missing velocity stem")
  Object.defineProperty(lane, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 12, height: 68 }),
    configurable: true,
  })
  fireEvent.pointerDown(lane, { button: 0, pointerId: 21, clientY: 34 })
  expect(notes()[0].velocity).toBe(64)
  expect(notes()[1].velocity).toBe(80)
  fireEvent.lostPointerCapture(lane, { pointerId: 21 })
  expect(notes()[0].velocity).toBe(90)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("releases a held draw override when focus leaves the editor", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "b" })
  expect(useProjectState.getState().session.drawModeOverride).toBe(true)
  fireEvent.blur(grid, { relatedTarget: document.body })
  expect(useProjectState.getState().session.drawModeOverride).toBeNull()
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
})

it("cancels a gesture on unmount and ignores its released pointer", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  const note = view.container.querySelector<HTMLElement>('[data-note-index="1"]')
  if (!note) throw new Error("Missing note")
  fireEvent.pointerDown(note, { button: 0, pointerId: 22, clientX: 100, clientY: 50 })
  fireEvent.pointerMove(grid, { pointerId: 22, clientX: 150, clientY: 50 })
  expect(notes()[1].startBeat).toBe(3.5)
  view.unmount()
  expect(notes()[1].startBeat).toBe(3)
  fireEvent.pointerUp(grid, { pointerId: 22 })
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("cancels clip-switch gestures before either clip can receive a stale edit", () => {
  const first = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === "midi-test")
  const second = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.kind === "midi" && clip.id !== "midi-test")
  if (first?.kind !== "midi" || second?.kind !== "midi") throw new Error("Missing MIDI fixtures")
  const secondNotes = second.notes
  const view = render(<MidiEditor clip={first} numerator={4} color="var(--primary)" />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  const note = view.container.querySelector<HTMLElement>('[data-note-index="1"]')
  if (!note) throw new Error("Missing note")
  fireEvent.pointerDown(note, { button: 0, pointerId: 23, clientX: 100, clientY: 50 })
  fireEvent.pointerMove(grid, { pointerId: 23, clientX: 150, clientY: 50 })
  expect(notes()[1].startBeat).toBe(3.5)
  view.rerender(<MidiEditor clip={second} numerator={4} color="var(--primary)" />)
  fireEvent.pointerMove(view.getByRole("grid"), { pointerId: 23, clientX: 250, clientY: 50 })
  fireEvent.pointerUp(view.getByRole("grid"), { pointerId: 23 })
  expect(notes()[1].startBeat).toBe(3)
  expect(
    useProjectState
      .getState()
      .document.tracks.flatMap(track => track.clips)
      .find(clip => clip.id === second.id)
  ).toMatchObject({ notes: secondNotes })
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("folds rows and zooms the viewport without changing the document", () => {
  const view = render(<Editor />)
  const before = useProjectState.getState().document
  const toolbar = view.container.querySelectorAll<HTMLButtonElement>(
    '[data-midi-editor] [data-slot="button"]'
  )
  expect(view.getByRole("grid").getAttribute("aria-rowcount")).toBe("128")
  fireEvent.click(toolbar[0])
  expect(view.getByRole("grid").getAttribute("aria-rowcount")).toBe("2")
  const width = view.getByRole("grid").style.width
  fireEvent.click(toolbar[3])
  expect(view.getByRole("grid").style.width).not.toBe(width)
  fireEvent.click(toolbar[5])
  expect(useProjectState.getState().document).toBe(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("selects a piano row and releases public audition on cancellation", () => {
  const view = render(<Editor />)
  const key = view.container.querySelector<HTMLButtonElement>('button[aria-label$="E3"]')
  if (!key) throw new Error("Missing E3 piano key")
  const before = useProjectState.getState().document
  fireEvent.pointerDown(key, { button: 0, pointerId: 24 })
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([64])
  expect(view.container.querySelector('[data-note-index="1"]')?.getAttribute("aria-selected")).toBe(
    "true"
  )
  fireEvent.pointerCancel(key, { pointerId: 24 })
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  expect(useProjectState.getState().document).toBe(before)
})

it("updates the selected numeric velocity and restores it with undo", () => {
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  grid.focus()
  fireEvent.keyDown(grid, { key: "a", metaKey: true })
  const velocity = view.container.querySelector<HTMLInputElement>('input[type="number"][min="1"]')
  if (!velocity) throw new Error("Missing selected velocity input")
  fireEvent.change(velocity, { target: { value: "111" } })
  expect(notes().map(note => note.velocity)).toEqual([111, 111])
  projectActions.undo()
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
})

it("releases an Arrangement computer-keyboard note after focus moves to the grid", () => {
  function KeyboardEditor() {
    useMidiKeyboard()
    return <Editor />
  }
  projectActions.setMode("computerKeyboard", true)
  const view = render(<KeyboardEditor />)
  fireEvent.keyDown(window, { key: "a", code: "KeyA" })
  expect(useProjectState.getState().session.activeMidiNotes).toHaveLength(1)
  const grid = view.getByRole("grid")
  fireEvent.pointerDown(grid, { button: 0, pointerId: 31, clientX: 0, clientY: 0 })
  fireEvent.keyUp(grid, { key: "a", code: "KeyA" })
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
  fireEvent.keyDown(window, { key: "a", code: "KeyA" })
  expect(useProjectState.getState().session.activeMidiNotes).toHaveLength(1)
  fireEvent.keyUp(grid, { key: "a", code: "KeyA" })
  fireEvent.pointerCancel(grid, { pointerId: 31 })
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("keeps a marquee's source origin fixed while the grid scrolls in both axes", () => {
  projectActions.updateClip("midi-test", {
    notes: [{ id: "scroll-selected", pitch: 64, startBeat: 3.5, lengthBeats: 0.25, velocity: 80 }],
  })
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  let left = 100
  let top = 100
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left, top, width: 384, height: 128 * 18 }),
    configurable: true,
  })
  fireEvent.pointerDown(grid, {
    button: 0,
    pointerId: 32,
    clientX: 196,
    clientY: top + (127 - 65) * 18,
  })
  left -= 96
  top -= 36
  fireEvent.wheel(grid, { deltaX: 96, deltaY: 36 })
  fireEvent.pointerMove(grid, { pointerId: 32, clientX: 244, clientY: top + (127 - 63) * 18 })
  expect(view.container.querySelector('[data-note-index="0"]')?.getAttribute("aria-selected")).toBe(
    "true"
  )
  fireEvent.pointerUp(grid, { pointerId: 32 })
  expect(notes()[0]).toMatchObject({ startBeat: 3.5, pitch: 64, lengthBeats: 0.25 })
})

it("drags the selected low-velocity chord handle without editing the coincident high note", () => {
  projectActions.updateClip("midi-test", {
    notes: [
      { id: "chord-low", pitch: 60, startBeat: 3, lengthBeats: 1, velocity: 40 },
      { id: "chord-high", pitch: 64, startBeat: 3, lengthBeats: 1, velocity: 100 },
    ],
  })
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  const lowNote = view.container.querySelector<HTMLElement>('[data-note-index="0"]')
  if (!lowNote) throw new Error("Missing low chord note")
  fireEvent.pointerDown(lowNote, { button: 0, pointerId: 33, clientX: 50, clientY: 50 })
  fireEvent.pointerUp(grid, { pointerId: 33 })
  const stems = view.container.querySelectorAll<HTMLButtonElement>(
    '[data-midi-editor] [role="group"] button'
  )
  const low = stems[0]
  const handle = low.querySelector<HTMLElement>(".pointer-events-auto")
  if (!handle) throw new Error("Missing independently hittable velocity handle")
  Object.defineProperty(low, "getBoundingClientRect", {
    value: () => ({ left: 100, top: 200, width: 12, height: 68 }),
    configurable: true,
  })
  fireEvent.pointerDown(handle, { button: 0, pointerId: 34, clientY: 200 + 68 * (1 - 40 / 127) })
  expect(notes().map(note => note.velocity)).toEqual([40, 100])
  fireEvent.pointerMove(low, { pointerId: 34, clientY: 200 + 68 * (1 - 80 / 127) })
  fireEvent.pointerUp(low, { pointerId: 34 })
  expect(notes().map(note => note.velocity)).toEqual([80, 100])
  fireEvent.keyDown(low, { key: "z", metaKey: true })
  expect(notes().map(note => note.velocity)).toEqual([40, 100])
})

it("undo cancels the active note gesture before consuming an earlier authored edit", () => {
  projectActions.setBpm(140)
  const view = render(<Editor />)
  const grid = view.getByRole("grid")
  Object.defineProperty(grid, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 400, height: 128 * 18 }),
    configurable: true,
  })
  const note = view.container.querySelector<HTMLElement>('[data-note-index="0"]')
  if (!note) throw new Error("Missing note fixture")
  fireEvent.pointerDown(note, { button: 0, pointerId: 35, clientX: 50, clientY: 30 })
  fireEvent.pointerMove(grid, { pointerId: 35, clientX: 150, clientY: 30 })
  expect(notes()[0].startBeat).not.toBe(0)
  fireEvent.keyDown(grid, { key: "z", metaKey: true })
  expect(notes()[0].startBeat).toBe(0)
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
  fireEvent.keyDown(grid, { key: "z", metaKey: true })
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})
