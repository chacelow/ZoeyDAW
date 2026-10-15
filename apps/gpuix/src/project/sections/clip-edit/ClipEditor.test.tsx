import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import { AUDIO_ID, MIDI_ID, PATTERN_ID, clipById, mount, seed } from "./harness.test"
import { demoLabels } from "./demo/labels"
import type { Harness } from "./harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

function open(id = PATTERN_ID) {
  view = mount(id)
  return view
}

function label() {
  return clipById(PATTERN_ID).label
}

function steps() {
  const clip = clipById(PATTERN_ID)
  if (clip.kind !== "pattern") throw new Error("Expected pattern clip")
  return clip.steps ?? []
}

function closeControl(h: Harness) {
  const control = h.root.renderer
    .findByType("div")
    .find(node => node.customProps?.["aria-label"] === demoLabels.en.close)
  if (!control) throw new Error("Missing close control")
  return control
}

it("mounts exactly the selected clip kind's editor when selection changes", () => {
  const h = open()
  for (const [id, expected] of [
    [PATTERN_ID, "pattern-editor"],
    [AUDIO_ID, "audio-editor"],
    [MIDI_ID, "midi-grid"],
    [PATTERN_ID, "pattern-editor"],
  ] as const) {
    h.render(id)
    expect(h.root.renderer.findByTestId("clip-editor")).toBeDefined()
    for (const region of ["pattern-editor", "audio-editor", "midi-grid"]) {
      expect(Boolean(h.root.renderer.findByTestId(region))).toBe(region === expected)
    }
  }
})

it("routes Cmd+Z and Cmd+Shift+Z from a close control to project history", () => {
  const h = open()
  const step = h.bounds("pattern-step-0")
  const x = step.x + step.width / 2
  const y = step.y + step.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y, 0)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(steps()[0]).toBe(true)
  const close = closeControl(h)
  h.root.renderer.nativeSimulateKeystrokes(close.id, "cmd-z")
  expect(steps()[0]).toBe(false)
  h.root.renderer.nativeSimulateKeystrokes(close.id, "cmd-shift-z")
  expect(steps()[0]).toBe(true)
})

it("routes project undo and redo from a focused step control", () => {
  const h = open()
  h.key("pattern-step-3", "enter")
  expect(steps()[3]).toBe(true)
  h.key("pattern-step-3", "cmd-z")
  expect(steps()[3]).toBe(false)
  h.key("pattern-step-3", "cmd-shift-z")
  expect(steps()[3]).toBe(true)
})

it("commits live name changes as one undo entry and keeps text-field undo local", () => {
  const h = open()
  h.key("clip-name", "cmd-a A b c enter")
  expect(label()).toBe("Abc")
  projectActions.undo()
  expect(label()).toBeUndefined()
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.redo()
  expect(label()).toBe("Abc")

  h.key("clip-name", "cmd-a D")
  expect(label()).toBe("D")
  h.key("clip-name", "cmd-z")
  expect(label()).toBe("Abc")
  expect(useProjectState.getState().session.playing).toBe(false)
})

it("keeps focused name-field Cmd+Z local instead of undoing prior project changes", () => {
  projectActions.setBpm(140)
  const h = open()
  h.key("clip-name", "cmd-a A b c enter")
  expect(label()).toBe("Abc")
  h.key("clip-name", "cmd-a D")
  expect(label()).toBe("D")
  h.key("clip-name", "cmd-z")
  expect(label()).toBe("Abc")
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
  h.key("clip-name", "enter")
  projectActions.undo()
  expect(label()).toBeUndefined()
  expect(useProjectState.getState().document.transport.bpm).toBe(140)
})

it("Escape restores an in-progress name without creating a history entry", () => {
  const h = open()
  h.key("clip-name", "cmd-a C a n c e l")
  expect(label()).toBe("Cancel")
  h.key("clip-name", "escape")
  expect(label()).toBeUndefined()
  expect(useProjectState.getState().session.canUndo).toBe(false)
  projectActions.setBpm(140)
  projectActions.undo()
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
})

it("Space in the name field inserts text rather than starting playback", () => {
  const h = open()
  h.key("clip-name", "cmd-a N e w space N a m e enter")
  expect(label()).toBe("New Name")
  expect(useProjectState.getState().session.playing).toBe(false)
  expect(h.windowKeys).not.toContain("space")
})
