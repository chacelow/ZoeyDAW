import { expect, it } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { usesGhostInputMeter, usesLiveInputMeter } from "./input-levels"

const audio = createMockDocument(DEFAULT_TRACK_HEIGHT).tracks.find(track => track.kind === "audio")
if (!audio) throw new Error("Missing audio fixture")

it("selects ghost physical input only for armed audio input with monitoring Off", () => {
  const base = { ...audio, input: "external" as const, armed: true }
  expect(usesGhostInputMeter({ ...base, monitor: "off" })).toBe(true)
  expect(usesGhostInputMeter({ ...base, monitor: "in" })).toBe(false)
  expect(usesGhostInputMeter({ ...base, monitor: "auto" })).toBe(false)
  expect(usesGhostInputMeter({ ...base, armed: false, monitor: "off" })).toBe(false)
  expect(usesGhostInputMeter({ ...base, input: "none", monitor: "off" })).toBe(false)
})

it("uses audible input while stopped for In and armed Auto, but not Off or playback", () => {
  const base = { ...audio, input: "external" as const, armed: true }
  expect(usesLiveInputMeter({ ...base, monitor: "in" }, false)).toBe(true)
  expect(usesLiveInputMeter({ ...base, monitor: "auto" }, false)).toBe(true)
  expect(usesLiveInputMeter({ ...base, monitor: "off" }, false)).toBe(false)
  expect(usesLiveInputMeter({ ...base, monitor: "auto", armed: false }, false)).toBe(false)
  expect(usesLiveInputMeter({ ...base, monitor: "in" }, true)).toBe(false)
})
