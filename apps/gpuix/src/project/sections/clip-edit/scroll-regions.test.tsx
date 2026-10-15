import { afterEach, expect, test } from "bun:test"
import { AUDIO_ID, MIDI_ID, mount, seed } from "./harness.test"
import type { Harness } from "./harness.test"

let view: Harness | undefined
afterEach(() => {
  view?.unmount()
  view = undefined
})

test("MIDI toolbar vertical wheel reveals horizontally clipped controls without changing notes", () => {
  seed()
  view = mount(MIDI_ID, { width: 320, height: 360 })
  const toolbar = view.root.renderer.findByTestId("midi-toolbar")
  if (!toolbar) throw new Error("Missing toolbar")
  const box = view.bounds("midi-toolbar")
  view.root.renderer.nativeSimulateScrollWheel(box.x + box.width - 2, box.y + 1, 0, -60)
  expect(view.root.renderer.getScrollOffset(toolbar.id)?.[0]).toBeLessThan(0)
  expect(view.root.renderer.getScrollOffset(toolbar.id)?.[1]).toBe(0)
})

test("audio parameters expose a named keyboard reachable scroll region", () => {
  seed()
  view = mount(AUDIO_ID, { width: 500, height: 140 })
  const node = view.root.renderer.findByTestId("audio-parameters")
  if (!node) throw new Error("Missing parameters")
  const regions = Object.values(view.root.renderer.getA11yTree().nodes ?? {}).filter(
    item => item.aria?.role === "Region"
  )
  expect(regions.some(item => item.aria?.label === "Audio Clip")).toBe(true)
  view.root.renderer.focusElement(node.id)
  expect(view.root.renderer.getFocusedElementId()).toBe(node.id)
})
