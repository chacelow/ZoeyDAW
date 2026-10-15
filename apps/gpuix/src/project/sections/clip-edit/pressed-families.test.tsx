import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions } from "@/project/adapters"
import { CONTROL_METRICS } from "@/shared/theme/metrics/config"
import { AUDIO_ID, PATTERN_ID, clipById, mount, notes, seed } from "./harness.test"
import type { Harness } from "./harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

function node(h: Harness, id: string) {
  const element = h.root.renderer.findByTestId(id)
  if (!element) throw new Error(`Missing ${id}`)
  return element
}

function labelNode(h: Harness, label: string) {
  const element = h.root.renderer
    .findByType("div")
    .find(entry => entry.customProps?.["aria-label"] === label)
  if (!element) throw new Error(`Missing ${label}`)
  return element
}

function bounds(h: Harness, id: number) {
  const box = h.root.renderer.getElementBounds(id)
  if (!box) throw new Error(`Missing bounds ${id}`)
  return box
}

it("Button holds compact geometry with a distinct native active refinement, then activates on release", () => {
  const h = (view = mount())
  const button = labelNode(h, "Fold")
  const before = bounds(h, button.id)
  const active = button.style.active
  if (!active || typeof active !== "object" || !("backgroundColor" in active))
    throw new Error("Missing native active refinement")
  expect(active.backgroundColor).not.toEqual(button.style.backgroundColor)
  h.root.renderer.nativeSimulateMouseDown(before.x + before.width / 2, before.y + before.height / 2)
  expect(bounds(h, button.id)).toMatchObject({
    width: before.width,
    height: CONTROL_METRICS.default["--spacing-control-track"],
  })
  expect(h.root.renderer.findByTestId("midi-key-71")).toBeDefined()
  h.root.renderer.nativeSimulateMouseUp(before.x + before.width / 2, before.y + before.height / 2)
  expect(h.root.renderer.findByTestId("midi-key-71")).toBeUndefined()
  expect(labelNode(h, "Fold").style.backgroundColor).not.toEqual(button.style.backgroundColor)
  expect(bounds(h, button.id)).toMatchObject({ width: before.width, height: before.height })
})

it("DragPad changes dragging fill without resizing and restores its non-drag fill on release", () => {
  const h = (view = mount())
  h.key("midi-grid", "cmd-a")
  const before = h.bounds("midi-velocity-value")
  const idle = node(h, "midi-velocity-value").style.backgroundColor
  const x = before.x + before.width / 2
  const y = before.y + before.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x, y - 16, 0)
  expect(notes().map(note => note.velocity)).toEqual([94, 94])
  expect(node(h, "midi-velocity-value").style.backgroundColor).not.toEqual(idle)
  expect(h.bounds("midi-velocity-value")).toMatchObject({
    width: before.width,
    height: before.height,
  })
  h.root.renderer.nativeSimulateMouseUp(x, y - 16)
  expect(node(h, "midi-velocity-value").style.backgroundColor).toEqual(idle)
  expect(h.bounds("midi-velocity-value")).toMatchObject({
    width: before.width,
    height: before.height,
  })
})

it("piano pointer-down highlights the sounding key at its original size, and release restores fill", () => {
  const h = (view = mount())
  const before = h.bounds("midi-key-64")
  const idle = node(h, "midi-key-64").style.backgroundColor
  h.root.renderer.nativeSimulateMouseDown(before.x + 4, before.y + before.height / 2)
  expect(node(h, "midi-key-64").style.backgroundColor).not.toEqual(idle)
  expect(h.bounds("midi-key-64")).toMatchObject({ width: before.width, height: before.height })
  h.root.renderer.nativeSimulateMouseUp(before.x + 4, before.y + before.height / 2)
  expect(node(h, "midi-key-64").style.backgroundColor).toEqual(idle)
})

it("Pattern pointer-down paints an active step at its original size and undo restores fill", () => {
  const h = (view = mount(PATTERN_ID))
  const before = h.bounds("pattern-step-0")
  const idle = node(h, "pattern-step-0").style.backgroundColor
  const x = before.x + before.width / 2
  const y = before.y + before.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  expect(node(h, "pattern-step-0").style.backgroundColor).not.toEqual(idle)
  expect(h.bounds("pattern-step-0")).toMatchObject({ width: before.width, height: before.height })
  const pressed = node(h, "pattern-step-0").style.backgroundColor
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(node(h, "pattern-step-0").style.backgroundColor).toEqual(pressed)
  projectActions.undo()
  expect(node(h, "pattern-step-0").style.backgroundColor).toEqual(idle)
})

it("marker dragging moves placement while holding its size, then undo restores placement", () => {
  const h = (view = mount(AUDIO_ID))
  const before = h.bounds("audio-marker-start")
  const x = before.x + 2
  const y = before.y + before.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 30, y, 0)
  const held = h.bounds("audio-marker-start")
  expect(held.x).toBeGreaterThan(before.x)
  expect(held).toMatchObject({ width: before.width, height: before.height })
  h.root.renderer.nativeSimulateMouseUp(x + 30, y)
  expect(h.bounds("audio-marker-start").x).toBeCloseTo(held.x, 4)
  projectActions.undo()
  expect(h.bounds("audio-marker-start").x).toBeCloseTo(before.x, 4)
})

it("menu item keeps highlighted geometry through press, then selection closes it", () => {
  const h = (view = mount(AUDIO_ID))
  h.key("audio-warp-mode", "enter")
  const option = labelNode(h, "Tones")
  const before = bounds(h, option.id)
  const idle = option.style.backgroundColor
  const x = before.x + before.width / 2
  const y = before.y + before.height / 2
  h.root.renderer.nativeSimulateMouseMove(x, y)
  const highlighted = h.root.renderer.getElement(option.id)
  if (!highlighted) throw new Error("Missing highlighted option")
  expect(highlighted.style.backgroundColor).not.toEqual(idle)
  h.root.renderer.nativeSimulateMouseDown(x, y)
  expect(bounds(h, option.id)).toMatchObject({ width: before.width, height: before.height })
  h.root.renderer.nativeSimulateMouseUp(x, y)
  const clip = clipById(AUDIO_ID)
  if (clip.kind !== "audio") throw new Error("Expected audio")
  expect(clip.audioSettings?.warpMode).toBe("tones")
  expect(h.root.renderer.findByTestId("audio-warp-mode-content")).toBeUndefined()
})
