import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import { PATTERN_ID, clipById, mount, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

function open() {
  view = mount(PATTERN_ID)
  return view
}

function steps() {
  const clip = clipById(PATTERN_ID)
  if (clip.kind !== "pattern") throw new Error("Expected pattern clip")
  return clip.steps ?? []
}

function stepCenter(h: Harness, index: number): [number, number] {
  const box = h.bounds(`pattern-step-${index}`)
  return [box.x + box.width / 2, box.y + box.height / 2]
}

function beginStroke(h: Harness, index = 0) {
  const [x, y] = stepCenter(h, index)
  h.root.renderer.nativeSimulateMouseDown(x, y, 0)
  return [x, y] satisfies [number, number]
}

it("paints every crossed step in one undoable stroke", () => {
  const h = open()
  beginStroke(h)
  const [x, y] = stepCenter(h, 5)
  h.root.renderer.nativeSimulateMouseMove(x, y, 0)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(steps().slice(0, 7)).toEqual([true, true, true, true, true, true, false])
  projectActions.undo()
  expect(steps().every(step => !step)).toBe(true)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.redo()
  expect(steps().slice(0, 7)).toEqual([true, true, true, true, true, true, false])
})

for (const interruption of ["deactivation", "Escape", "unmount"] as const) {
  it(`rolls back a painted stroke on ${interruption} and leaves later undo usable`, () => {
    const h = open()
    const [x, y] = beginStroke(h)
    const [endX, endY] = stepCenter(h, 3)
    h.root.renderer.nativeSimulateMouseMove(endX, endY, 0)
    expect(steps().slice(0, 4)).toEqual([true, true, true, true])
    if (interruption === "deactivation") h.setActive(false)
    else if (interruption === "Escape") h.key("pattern-step-0", "escape")
    else {
      h.unmount()
      view = undefined
    }
    expect(steps().every(step => !step)).toBe(true)
    if (interruption !== "unmount") h.root.renderer.nativeSimulateMouseUp(x, y)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    projectActions.setBpm(140)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })
}

it("starts at the partially visible source step after a free trim", () => {
  projectActions.updateClip(PATTERN_ID, {
    steps: Array.from({ length: 16 }, (_, index) => index === 1),
    sourceOffsetBars: 0.1,
    lengthBars: 0.9,
  })
  const h = open()
  expect(h.root.renderer.findByTestId("pattern-step-14")).toBeDefined()
  expect(h.root.renderer.findByTestId("pattern-step-15")).toBeUndefined()
  const [x, y] = beginStroke(h)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(steps()[1]).toBe(false)
  expect(steps()[0]).toBe(false)
  projectActions.undo()
  expect(steps()[1]).toBe(true)
})

it("edits one source cycle, not repeated copies across a long clip", () => {
  projectActions.updateClip(PATTERN_ID, { lengthBars: 4 })
  const h = open()
  expect(h.root.renderer.findByTestId("pattern-step-15")).toBeDefined()
  expect(h.root.renderer.findByTestId("pattern-step-16")).toBeUndefined()
  const [x, y] = beginStroke(h, 15)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(steps()).toHaveLength(16)
  expect(steps()[15]).toBe(true)
  projectActions.undo()
  expect(steps()[15]).toBe(false)
})

it("Enter toggles the focused step while Space only reaches playback", () => {
  const h = open()
  h.key("pattern-step-2", "enter")
  expect(steps()[2]).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(false)
  h.key("pattern-step-2", "space")
  expect(steps()[2]).toBe(true)
  expect(h.windowKeys).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
  h.key("pattern-step-2", "enter")
  expect(steps()[2]).toBe(false)
})
