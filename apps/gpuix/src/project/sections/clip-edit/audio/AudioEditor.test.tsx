import { afterEach, beforeEach, expect, test } from "bun:test"
import { getAudioClipSettings } from "@/project/model/audio-editor"
import { projectActions, useProjectState } from "@/project/adapters"
import type { AudioClip } from "@/project/model/types"
import { AUDIO_ID, PATTERN_ID, clipById, mount, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

function audio(): AudioClip {
  const clip = clipById(AUDIO_ID)
  if (clip.kind !== "audio") throw new Error("Expected audio clip")
  return clip
}

function open() {
  view = mount(AUDIO_ID)
  return view
}

function pressStart(h: Harness) {
  const box = h.bounds("audio-marker-start")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  return { x, y, surfaceWidth: h.bounds("audio-surface").width }
}

test("clicking waveform content selects the source time without editing the clip", () => {
  const h = open()
  const before = audio()
  const surface = h.bounds("audio-surface")
  const x = surface.x + surface.width * 0.6
  const y = surface.y + surface.height * 0.5
  h.root.renderer.nativeSimulateMouseDown(x, y)
  const selection = h.bounds("audio-selection")
  expect(selection.x).toBeCloseTo(x, 0)
  expect(audio()).toEqual(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  h.root.renderer.nativeSimulateMouseUp(x, y)
})

test("wheel zoom and overview navigation alter the viewport without changing project state", () => {
  const h = open()
  const before = audio()
  const surface = h.bounds("audio-surface")
  const overview = h.bounds("audio-overview")
  const initial = h.bounds("audio-overview-frame")
  h.root.renderer.nativeSimulateScrollWheel(
    surface.x + surface.width / 2,
    surface.y + surface.height / 2,
    0,
    120,
    "cmd"
  )
  const zoomed = h.bounds("audio-overview-frame")
  expect(zoomed.width).toBeLessThan(initial.width)
  h.key("audio-overview", "right")
  const panned = h.bounds("audio-overview-frame")
  expect(panned.x).toBeGreaterThan(zoomed.x)
  expect(panned.x).toBeGreaterThanOrEqual(overview.x)
  expect(audio()).toEqual(before)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("source Start drag edits playback metadata, not Arrangement placement, and commits one undo entry", () => {
  const h = open()
  const before = audio()
  const { x, y, surfaceWidth } = pressStart(h)
  const movedX = x + surfaceWidth / 16
  h.root.renderer.nativeSimulateMouseMove(movedX, y, 0)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBeCloseTo(1)
  expect(audio().startBar).toBe(before.startBar)
  expect(audio().lengthBars).toBe(before.lengthBars)
  expect(audio().sourceOffsetBars).toBe(before.sourceOffsetBars)
  expect(audio().fadeInBars).toBe(before.fadeInBars)
  expect(audio().fadeOutBars).toBe(before.fadeOutBars)
  h.root.renderer.nativeSimulateMouseUp(movedX, y)
  expect(useProjectState.getState().session.canUndo).toBe(true)
  projectActions.undo()
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("keyboard nudges source Start by a sixteenth and Shift uses a finer step", () => {
  const h = open()
  h.key("audio-marker-start", "right")
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(1 / 16)
  h.key("audio-marker-start", "shift-right")
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(5 / 64)
  expect(audio().startBar).toBe(1)
  projectActions.undo()
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(1 / 16)
  projectActions.undo()
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
})

test("Escape cancels a source marker preview without recording undo", () => {
  const h = open()
  const { x, y, surfaceWidth } = pressStart(h)
  h.root.renderer.nativeSimulateMouseMove(x + surfaceWidth / 16, y, 0)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBeCloseTo(1)
  h.key("audio-marker-start", "escape")
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
  h.root.renderer.nativeSimulateMouseUp(x + surfaceWidth / 16, y)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("window deactivation rolls back a marker gesture", () => {
  const h = open()
  const { x, y, surfaceWidth } = pressStart(h)
  h.root.renderer.nativeSimulateMouseMove(x + surfaceWidth / 16, y, 0)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBeCloseTo(1)
  h.setActive(false)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("switching to another clip editor cancels the active audio marker gesture", () => {
  const h = open()
  const { x, y, surfaceWidth } = pressStart(h)
  h.root.renderer.nativeSimulateMouseMove(x + surfaceWidth / 16, y, 0)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBeCloseTo(1)
  h.render(PATTERN_ID)
  expect(h.root.renderer.findByTestId("pattern-editor")).toBeDefined()
  expect(h.root.renderer.findByTestId("audio-editor")).toBeUndefined()
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("typing a musical loop position through the shared native number editor commits a parsed source position", () => {
  const h = open()
  h.key("audio-loopStartBars", "enter")
  const input = h.root.renderer.findByTestId("audio-loopStartBars-value")
  if (!input || input.type !== "input") throw new Error("Musical input did not open")
  h.root.renderer.nativeSimulateKeystrokes(input.id, "cmd-a 3 . 2 . 1 enter")
  expect(getAudioClipSettings(audio(), 120).loopStartBars).toBe(2.25)
  expect(getAudioClipSettings(audio(), 120).startMarkerBars).toBe(0)
  projectActions.undo()
  expect(getAudioClipSettings(audio(), 120).loopStartBars).toBe(0)
})

test("warp mode cannot open while warp is off, and the loop toggle changes no window bounds", () => {
  const h = open()
  const initial = getAudioClipSettings(audio(), 120)
  h.key("audio-warp", "enter")
  expect(getAudioClipSettings(audio(), 120).warp).toBe(false)
  h.key("audio-warp-mode", "enter")
  expect(h.root.renderer.findByTestId("audio-warp-mode-content")).toBeUndefined()
  expect(getAudioClipSettings(audio(), 120).warpMode).toBe(initial.warpMode)
  h.key("audio-loop", "enter")
  const toggled = getAudioClipSettings(audio(), 120)
  expect(toggled.loop).toBe(false)
  expect([
    toggled.loopStartBars,
    toggled.loopLengthBars,
    toggled.startMarkerBars,
    toggled.endMarkerBars,
  ]).toEqual([
    initial.loopStartBars,
    initial.loopLengthBars,
    initial.startMarkerBars,
    initial.endMarkerBars,
  ])
})
