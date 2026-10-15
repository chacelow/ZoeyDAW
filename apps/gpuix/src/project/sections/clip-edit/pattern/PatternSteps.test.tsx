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

function seedLongCycle() {
  seed(clips => {
    const clip = clips.find(item => item.id === PATTERN_ID)
    if (clip?.kind !== "pattern") throw new Error("Missing Pattern fixture")
    clip.lengthBars = 64
    clip.steps = Array.from({ length: 1024 }, () => false)
  })
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

it("keeps the translated step name stable while pressed state changes", () => {
  const h = open()
  const step = h.root.renderer.findByTestId("pattern-step-0")
  if (!step) throw new Error("Missing first step")
  const name = h.root.renderer.getElement(step.id)?.customProps?.["aria-label"]
  expect(typeof name).toBe("string")
  expect(name).not.toMatch(/\((on|off)\)/)
  expect(steps()[0]).toBe(false)
  h.key("pattern-steps", "enter")
  expect(h.root.renderer.getElement(step.id)?.customProps?.["aria-label"]).toBe(name)
  expect(steps()[0]).toBe(true)
})

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
    else if (interruption === "Escape") h.key("pattern-steps", "escape")
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

it("Enter toggles the current step while Space only reaches playback", () => {
  const h = open()
  h.key("pattern-steps", "right")
  h.key("pattern-steps", "right")
  h.key("pattern-steps", "enter")
  expect(steps()[2]).toBe(true)
  expect(useProjectState.getState().session.playing).toBe(false)
  h.key("pattern-steps", "space")
  expect(steps()[2]).toBe(true)
  expect(h.windowKeys).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
  h.key("pattern-steps", "enter")
  expect(steps()[2]).toBe(false)
})

it("clicking visible steps in a 1024-step cycle edits exactly those source steps", () => {
  seedLongCycle()
  const h = open()
  for (const index of [1, 2, 3]) {
    const [x, y] = stepCenter(h, index)
    h.root.renderer.nativeSimulateClick(x, y)
    expect(steps().flatMap((on, step) => (on ? [step] : []))).toEqual([index])
    projectActions.undo()
    expect(steps().every(on => !on)).toBe(true)
  }
})

it("reveals and edits step 1023, then picks the right source step after wheel scrolling", () => {
  seedLongCycle()
  const h = open()
  expect(h.root.renderer.findByTestId("pattern-step-1023")).toBeUndefined()
  h.key("pattern-steps", "end")
  expect(h.root.renderer.findByTestId("pattern-step-0")).toBeUndefined()
  const viewport = h.bounds("pattern-steps")
  const last = h.bounds("pattern-step-1023")
  expect(last.width).toBeGreaterThan(2)
  expect(last.x).toBeGreaterThanOrEqual(viewport.x)
  expect(last.x + last.width).toBeLessThanOrEqual(viewport.x + viewport.width)
  const [x, y] = stepCenter(h, 1023)
  h.root.renderer.nativeSimulateClick(x, y)
  expect(steps().flatMap((on, step) => (on ? [step] : []))).toEqual([1023])
  projectActions.undo()
  expect(steps()[1023]).toBe(false)
  h.key("pattern-steps", "home")
  h.root.renderer.nativeSimulateScrollWheel(
    viewport.x + viewport.width / 2,
    viewport.y + viewport.height / 2,
    -150,
    0
  )
  expect(h.root.renderer.findByTestId("pattern-step-0")).toBeUndefined()
  const [scrollX, scrollY] = stepCenter(h, 12)
  h.root.renderer.nativeSimulateClick(scrollX, scrollY)
  expect(steps().flatMap((on, step) => (on ? [step] : []))).toEqual([12])
  projectActions.undo()
  expect(steps().every(on => !on)).toBe(true)
})

it("keeps one Pattern Tab entry and cancels a current stroke before Undo", () => {
  const h = open()
  const owner = h.root.renderer.findByTestId("pattern-steps")
  if (!owner) throw new Error("Missing Pattern owner")
  h.key("pattern-steps", "tab")
  expect(h.root.renderer.getFocusedElementId()).not.toBe(owner.id)
  expect(
    h.root.renderer
      .findByType("div")
      .filter(node => node.testId?.startsWith("pattern-step-"))
      .map(node => node.id)
  ).not.toContain(h.root.renderer.getFocusedElementId())
  projectActions.setBpm(140)
  const [x, y] = beginStroke(h, 2)
  expect(steps()[2]).toBe(true)
  h.key("pattern-steps", "cmd-z")
  expect(steps()[2]).toBe(false)
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  h.key("pattern-steps", "cmd-z")
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("wraps a retained negative source offset into the same source cycle", () => {
  projectActions.updateClip(PATTERN_ID, { sourceOffsetBars: -1 / 16 })
  const h = open()
  const [x, y] = beginStroke(h, 0)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(steps().flatMap((on, step) => (on ? [step] : []))).toEqual([15])
})

it("the shared scrollbar reaches the last step and returns focus to the editing owner", () => {
  seedLongCycle()
  const h = open()
  const scrollbar = h.bounds("pattern-horizontal-scroll")
  h.root.renderer.nativeSimulateClick(
    scrollbar.x + scrollbar.width - 2,
    scrollbar.y + scrollbar.height / 2
  )
  expect(h.root.renderer.findByTestId("pattern-step-0")).toBeUndefined()
  expect(h.root.renderer.getFocusedElementId()).toBe(
    h.root.renderer.findByTestId("pattern-steps")?.id ?? null
  )
  const [x, y] = stepCenter(h, 1023)
  h.root.renderer.nativeSimulateClick(x, y)
  expect(steps().flatMap((on, index) => (on ? [index] : []))).toEqual([1023])
  const owner = h.root.renderer.findByTestId("pattern-steps")
  if (!owner) throw new Error("Missing Pattern owner")
  expect(h.root.renderer.getFocusedElementId()).toBe(owner.id)
})

for (const terminal of ["release", "Escape", "deactivation"] as const) {
  it(`keeps a scrolled brush stroke atomic through ${terminal}`, () => {
    seedLongCycle()
    const h = open()
    beginStroke(h, 1)
    const viewport = h.bounds("pattern-steps")
    h.root.renderer.nativeSimulateScrollWheel(
      viewport.x + viewport.width / 2,
      viewport.y + viewport.height / 2,
      -150,
      0
    )
    const [x, y] = stepCenter(h, 12)
    h.root.renderer.nativeSimulateMouseMove(x, y, 0)
    expect(steps().flatMap((on, index) => (on ? [index] : []))).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    )
    if (terminal === "Escape") h.key("pattern-steps", "escape")
    else if (terminal === "deactivation") h.setActive(false)
    h.root.renderer.nativeSimulateMouseUp(x, y)
    if (terminal === "release") {
      expect(useProjectState.getState().session.canUndo).toBe(true)
      projectActions.undo()
    }
    expect(steps().every(on => !on)).toBe(true)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })
}
