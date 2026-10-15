import { afterEach, beforeEach, expect, it } from "bun:test"
import { projectActions, useProjectState } from "@/project/adapters"
import { getAudioClipSettings } from "@/project/model/audio-editor"
import { AUDIO_ID, clipById, mount, seed } from "../harness.test"
import type { Harness } from "../harness.test"

let view: Harness | undefined
beforeEach(() => seed())
afterEach(() => {
  view?.unmount()
  view = undefined
})

it("cancels a marker drag before a keyboard nudge and keeps its undo independent", () => {
  const h = (view = mount(AUDIO_ID))
  const clip = clipById(AUDIO_ID)
  if (clip.kind !== "audio") throw new Error("Expected audio clip")
  const transport = useProjectState.getState().document.transport
  const original = getAudioClipSettings(clip, transport.bpm).startMarkerBars
  const box = h.bounds("audio-marker-start")
  const x = box.x + 2
  const y = box.y + box.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y)
  h.root.renderer.nativeSimulateMouseMove(x + 40, y, 0)
  const preview = clipById(AUDIO_ID)
  if (preview.kind !== "audio") throw new Error("Expected audio preview")
  expect(getAudioClipSettings(preview, transport.bpm).startMarkerBars).toBeGreaterThan(original)
  h.key("audio-marker-start", "right")
  const nudged = clipById(AUDIO_ID)
  if (nudged.kind !== "audio") throw new Error("Expected nudged clip")
  const value = original + transport.denominator / (transport.numerator * 16)
  expect(getAudioClipSettings(nudged, transport.bpm).startMarkerBars).toBe(value)
  h.root.renderer.nativeSimulateMouseMove(x + 100, y, 0)
  h.root.renderer.nativeSimulateMouseUp(x + 100, y)
  h.key("audio-marker-start", "escape")
  const released = clipById(AUDIO_ID)
  if (released.kind !== "audio") throw new Error("Expected released clip")
  expect(getAudioClipSettings(released, transport.bpm).startMarkerBars).toBe(value)
  projectActions.undo()
  const restored = clipById(AUDIO_ID)
  if (restored.kind !== "audio") throw new Error("Expected restored clip")
  expect(getAudioClipSettings(restored, transport.bpm).startMarkerBars).toBe(original)
  expect(useProjectState.getState().session.canUndo).toBe(false)
})
