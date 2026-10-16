import { afterEach, beforeEach, expect, it } from "bun:test"
import { handleGpuixEvent } from "@gpuix/react"
import { projectActions, useProjectState } from "@/project/adapters"
import { MIDI_ID, PATTERN_ID, clipById, mount, notes, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
  projectActions.setMode("drawMode", false)
})

function open(id = MIDI_ID) {
  view = mount(id)
  return view
}

function rowCenter(h: Harness, pitch: number) {
  const key = h.bounds(`midi-key-${pitch}`)
  const grid = h.bounds("midi-grid")
  return key.y + key.height / 2 - grid.y
}

function noteBox(h: Harness, id: string) {
  return h.bounds(`midi-note-${id}`)
}

function press(h: Harness, x: number, y: number, modifiers?: string) {
  h.root.renderer.nativeSimulateMouseDown(x, y, 0, modifiers)
}

it("selects every visible note with Cmd+A and deletes them as one undo entry", () => {
  const h = open()
  h.key("midi-grid", "cmd-a")
  expect(h.root.renderer.findByTestId("midi-note-retained")).toBeTruthy()
  expect(h.root.renderer.getAutomationTree()).toContain("2 selected")
  h.key("midi-grid", "delete")
  expect(notes()).toHaveLength(0)
  projectActions.undo()
  expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("moves selected notes by keyboard and an octave with Shift, keeping retained starts", () => {
  const h = open()
  h.key("midi-grid", "cmd-a up")
  expect(notes().map(note => [note.startBeat, note.pitch])).toEqual([
    [0, 73],
    [3, 65],
  ])
  h.key("midi-grid", "shift-down")
  expect(notes().map(note => note.pitch)).toEqual([61, 53])
  projectActions.undo()
  projectActions.undo()
  expect(notes().map(note => note.pitch)).toEqual([72, 64])
})

it("drags a note in sixteenths and pitches, and Escape restores it without an undo entry", () => {
  const h = open()
  const box = noteBox(h, "visible")
  const y = box.y + box.height / 2
  const sixteenth = h.bounds("midi-grid").width / 16
  press(h, box.x + 2, y)
  h.root.renderer.nativeSimulateMouseMove(box.x + 2 + sixteenth * 2, y, 0)
  expect(notes()[1]?.startBeat).toBe(3.5)
  h.key("midi-grid", "escape")
  expect(notes()[1]?.startBeat).toBe(3)
  h.root.renderer.nativeSimulateMouseUp(box.x + 2 + sixteenth * 2, y)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("commits a note move as one undo entry and resizes from the right edge", () => {
  const h = open()
  const box = noteBox(h, "visible")
  const y = box.y + box.height / 2
  const sixteenth = h.bounds("midi-grid").width / 16
  press(h, box.x + 2, y)
  h.root.renderer.nativeSimulateMouseMove(box.x + 2 + sixteenth, y, 0)
  h.root.renderer.nativeSimulateMouseUp(box.x + 2 + sixteenth, y)
  expect(notes()[1]?.startBeat).toBe(3.25)
  const moved = noteBox(h, "visible")
  press(h, moved.x + moved.width - 1, y)
  h.root.renderer.nativeSimulateMouseMove(moved.x + moved.width - 1 + sixteenth * 2, y, 0)
  h.root.renderer.nativeSimulateMouseUp(moved.x + moved.width - 1 + sixteenth * 2, y)
  expect(notes()[1]).toMatchObject({ startBeat: 3.25, lengthBeats: 1.5 })
  projectActions.undo()
  expect(notes()[1]).toMatchObject({ startBeat: 3.25, lengthBeats: 1 })
  projectActions.undo()
  expect(notes()[1]).toMatchObject({ startBeat: 3, lengthBeats: 1 })
})

it("rolls back an active move when the window deactivates", () => {
  const h = open()
  const box = noteBox(h, "retained")
  const y = box.y + box.height / 2
  press(h, box.x + 2, y)
  h.root.renderer.nativeSimulateMouseMove(box.x + 80, y, 0)
  expect(notes()[0]?.startBeat).not.toBe(0)
  h.setActive(false)
  expect(notes()[0]?.startBeat).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("double-click creates a note on the grid row and double-click on a note deletes it", () => {
  const h = open()
  const grid = h.bounds("midi-grid")
  const y = grid.y + rowCenter(h, 70)
  const x = grid.x + grid.width / 2 + 1
  const element = h.root.renderer.findByTestId("midi-grid")
  if (!element) throw new Error("Missing grid")
  handleGpuixEvent(
    { elementId: element.id, eventType: "mouseDown", x, y, button: 0, clickCount: 2 },
    h.root.renderer
  )
  expect(notes().at(-1)).toMatchObject({ pitch: 70, startBeat: 4, lengthBeats: 1 })
  handleGpuixEvent(
    { elementId: element.id, eventType: "mouseDown", x, y, button: 0, clickCount: 2 },
    h.root.renderer
  )
  expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
})

it("draws crossed cells in draw mode as one undo entry and marks the B gesture", () => {
  projectActions.setMode("drawMode", true)
  const h = open()
  const grid = h.bounds("midi-grid")
  const y = grid.y + rowCenter(h, 70)
  const sixteenth = grid.width / 16
  press(h, grid.x + sixteenth * 8 + 1, y)
  h.root.renderer.nativeSimulateMouseMove(grid.x + sixteenth * 11 + 1, y, 0)
  h.root.renderer.nativeSimulateMouseUp(grid.x + sixteenth * 11 + 1, y)
  const drawn = notes().filter(note => note.pitch === 70)
  expect(drawn.map(note => note.startBeat)).toEqual([4, 4.25, 4.5, 4.75])
  expect(h.drawMarks.count).toBe(1)
  projectActions.undo()
  expect(notes()).toHaveLength(2)
})

it("erases a hit note in draw mode and restores it when the window deactivates", () => {
  projectActions.setMode("drawMode", true)
  const h = open()
  const box = noteBox(h, "visible")
  press(h, box.x + 2, box.y + box.height / 2)
  expect(notes().map(note => note.id)).toEqual(["retained"])
  h.setActive(false)
  expect(notes().map(note => note.id)).toEqual(["retained", "visible"])
})

it("marquee-selects intersecting notes and restores the prior selection on Escape", () => {
  const h = open()
  const grid = h.bounds("midi-grid")
  const top = grid.y + rowCenter(h, 73)
  press(h, grid.x + 1, top)
  h.root.renderer.nativeSimulateMouseMove(grid.x + grid.width * 0.2, grid.y + rowCenter(h, 71), 0)
  expect(h.root.renderer.findByTestId("midi-marquee")).toBeTruthy()
  expect(h.root.renderer.getAutomationTree()).toContain("1 selected")
  h.key("midi-grid", "escape")
  expect(h.root.renderer.getAutomationTree()).toContain("0 selected")
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("copies selected notes to the injected clipboard, ignores foreign text and pastes a copy", () => {
  const h = open()
  h.key("midi-grid", "cmd-a cmd-c")
  const copied = h.clipboard.text
  expect(copied).toContain("x-zoeymind-midi-notes")
  h.key("midi-grid", "delete")
  h.clipboard.text = "ordinary text"
  h.key("midi-grid", "cmd-v")
  expect(notes()).toHaveLength(0)
  h.clipboard.text = copied
  h.key("midi-grid", "cmd-v")
  expect(notes().map(note => note.startBeat)).toEqual([0.25, 3.25])
})

it("cuts and duplicates through single undo entries", () => {
  const h = open()
  h.key("midi-grid", "cmd-a cmd-d")
  expect(notes().map(note => note.startBeat)).toEqual([0, 3, 3, 4])
  expect(new Set(notes().map(note => note.id)).size).toBe(4)
  projectActions.undo()
  h.key("midi-grid", "cmd-a cmd-x")
  expect(notes()).toHaveLength(0)
  projectActions.undo()
  expect(notes().map(note => note.startBeat)).toEqual([0, 3])
})

it("quantizes selected starts with Cmd+U as one undo entry", () => {
  projectActions.updateClip(MIDI_ID, {
    notes: [{ id: "off", pitch: 64, startBeat: 3.1, lengthBeats: 0.6, velocity: 80 }],
  })
  const h = open()
  h.key("midi-grid", "cmd-a cmd-u")
  expect(notes()[0]).toMatchObject({ startBeat: 3, lengthBeats: 0.6 })
  projectActions.undo()
  expect(notes()[0]?.startBeat).toBe(3.1)
})

it("Cmd+Z during a drag cancels the gesture before undoing earlier history", () => {
  projectActions.setBpm(140)
  const h = open()
  const box = noteBox(h, "retained")
  const y = box.y + box.height / 2
  press(h, box.x + 2, y)
  h.root.renderer.nativeSimulateMouseMove(box.x + 80, y, 0)
  h.key("midi-grid", "cmd-z")
  expect(notes()[0]?.startBeat).toBe(0)
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
  h.key("midi-grid", "cmd-z")
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("lets Space through the focused grid to the window owner without editing", () => {
  const h = open()
  h.key("midi-grid", "space")
  expect(h.windowKeys).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(h.regionKeys).toHaveLength(1)
  expect(h.regionKeys[0]).toBeNumber()
  h.key("midi-grid", "cmd-a")
  expect(h.windowKeys).toEqual(["space"])
  expect(h.regionKeys).toHaveLength(1)
})

it("auditions a piano key, selects its row, and releases the note on mouse up", () => {
  const h = open()
  const key = h.bounds("midi-key-64")
  h.root.renderer.nativeSimulateMouseDown(key.x + 4, key.y + key.height / 2)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([64])
  expect(h.root.renderer.getAutomationTree()).toContain("1 selected")
  h.root.renderer.nativeSimulateMouseUp(key.x + 4, key.y + key.height / 2)
  expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
})

it("drags a selected velocity stem as one transaction", () => {
  const h = open()
  h.key("midi-grid", "cmd-a")
  const lane = h.bounds("midi-velocity")
  const stem = noteBox(h, "visible")
  const at = (velocity: number) => lane.y + lane.height * (1 - velocity / 127)
  press(h, stem.x, at(80))
  h.root.renderer.nativeSimulateMouseMove(stem.x, at(110), 0)
  h.root.renderer.nativeSimulateMouseUp(stem.x, at(110))
  expect(notes().map(note => note.velocity)).toEqual([110, 110])
  projectActions.undo()
  expect(notes().map(note => note.velocity)).toEqual([90, 80])
})

it("folds to used pitches and zooms without touching the project", () => {
  const h = open()
  const before = useProjectState.getState().document
  const fold = h.root.renderer.findByText("Fold")
  if (!fold) throw new Error("Missing Fold")
  const box = h.root.renderer.getElementBounds(fold.id)
  if (!box) throw new Error("Missing Fold bounds")
  h.root.renderer.nativeSimulateClick(box.x + 2, box.y + 2)
  expect(h.root.renderer.findByTestId("midi-key-72")).toBeTruthy()
  expect(h.root.renderer.findByTestId("midi-key-71")).toBeFalsy()
  expect(useProjectState.getState().document).toBe(before)
})

it("keeps accessible note rows and batched painting inside the viewport", () => {
  projectActions.updateClip(MIDI_ID, {
    notes: Array.from({ length: 128 }, (_, pitch) => ({
      id: `p${pitch}`,
      pitch,
      startBeat: 2 + (pitch % 4),
      lengthBeats: 0.5,
      velocity: 64,
    })),
  })
  const h = open()
  const divs = h.root.renderer.findByType("div")
  const mounted = divs.filter(element => element.testId?.startsWith("midi-note-row-"))
  const visiblePitches = divs
    .filter(element => element.testId?.startsWith("midi-key-"))
    .map(element => element.testId?.replace("midi-key-", "midi-note-row-"))
    .sort((a, b) => Number(a?.split("-").at(-1)) - Number(b?.split("-").at(-1)))
  expect(mounted.length).toBeLessThan(128)
  expect(mounted.map(element => element.testId)).toEqual(visiblePitches)
  const grid = h.bounds("midi-grid")
  expect(h.root.renderer.findByTestId("midi-note-row-0")).toBeUndefined()
  expect(h.root.renderer.findByTestId("midi-note-row-127")).toBeUndefined()
  for (const element of mounted) {
    if (!element) throw new Error("Missing mounted note")
    const box = h.root.renderer.getElementBounds(element.id)
    if (!box) throw new Error("Missing note bounds")
    expect(box.y + box.height).toBeGreaterThan(grid.y)
    expect(box.y).toBeLessThan(grid.y + grid.height)
  }
})

it("switching clips cancels the previous clip's gesture", () => {
  const h = open()
  const box = noteBox(h, "visible")
  const y = box.y + box.height / 2
  press(h, box.x + 2, y)
  h.root.renderer.nativeSimulateMouseMove(box.x + 60, y, 0)
  expect(notes()[1]?.startBeat).not.toBe(3)
  h.render(PATTERN_ID)
  expect(notes()[1]?.startBeat).toBe(3)
  expect(clipById(PATTERN_ID).kind).toBe("pattern")
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
