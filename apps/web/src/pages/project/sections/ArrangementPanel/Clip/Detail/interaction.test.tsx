// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { ClipDetail } from "."

function Editor() {
  const clip = useProjectState(s =>
    s.document.tracks.flatMap(track => track.clips).find(item => item.id === "pattern-test")
  )
  return clip ? <ClipDetail clip={clip} close={() => {}} /> : null
}

function patternSteps() {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === "pattern-test")
  if (!clip || clip.kind !== "pattern") throw new Error("Missing pattern fixture")
  return clip.steps ?? []
}

beforeEach(() => {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.id === "trager")
  if (!track) throw new Error("Missing MIDI track")
  track.clips.push({
    id: "pattern-test",
    kind: "pattern",
    patternId: "steps",
    startBar: 1,
    lengthBars: 1,
    steps: Array.from({ length: 16 }, () => false),
  })
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture")
  Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture")
})

for (const end of ["lostpointercapture", "blur", "unmount"] as const) {
  it(`rolls back painting and keeps later undo working after ${end}`, () => {
    const view = render(<Editor />)
    const step = view.container.querySelector<HTMLElement>('[data-step-index="0"]')
    if (!step) throw new Error("Missing step")
    fireEvent.pointerDown(step, { button: 0, pointerId: 1 })
    expect(patternSteps()[0]).toBe(true)
    if (end === "unmount") view.unmount()
    else if (end === "blur") fireEvent(window, new Event("blur"))
    else fireEvent.lostPointerCapture(step.parentElement ?? step, { pointerId: 1 })
    expect(patternSteps()[0]).toBe(false)
    projectActions.setBpm(140)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  })
}

it("fills crossed steps on fast painting as one undoable edit", () => {
  const view = render(<Editor />)
  const first = view.container.querySelector<HTMLElement>('[data-step-index="0"]')
  const last = view.container.querySelector<HTMLElement>('[data-step-index="5"]')
  if (!first || !last) throw new Error("Missing steps")
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => last })
  fireEvent.pointerDown(first, { button: 0, pointerId: 1 })
  fireEvent.pointerMove(first.parentElement ?? first, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(first.parentElement ?? first, { pointerId: 1 })
  expect(patternSteps().slice(0, 6)).toEqual([true, true, true, true, true, true])
  expect(patternSteps()[6]).toBe(false)
  projectActions.undo()
  expect(patternSteps().every(step => !step)).toBe(true)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  Reflect.deleteProperty(document, "elementFromPoint")
})

it("keeps the partially visible first source step after a free trim", () => {
  const steps = patternSteps().map((_, index) => index === 1)
  projectActions.updateClip("pattern-test", { steps, sourceOffsetBars: 0.1, lengthBars: 0.9 })
  const view = render(<Editor />)
  expect(view.container.querySelector('[data-step-index="0"]')?.getAttribute("aria-pressed")).toBe(
    "true"
  )
  expect(view.container.querySelectorAll("[data-step-index]")).toHaveLength(15)
})

it("edits one source cycle rather than allocating repeat copies for a long Pattern clip", () => {
  projectActions.updateClip("pattern-test", { lengthBars: 4 })
  const view = render(<Editor />)
  expect(view.container.querySelectorAll("[data-step-index]")).toHaveLength(16)
})
