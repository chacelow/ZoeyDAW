import { expect, it } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { usesGhostInputMeter } from "./input-levels"

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
