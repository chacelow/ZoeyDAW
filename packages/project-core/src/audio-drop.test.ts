import { expect, it } from "vitest"
import { canAcceptAudioDrop } from "./audio-drop"
import { createTrack } from "./reducers"
import { createDevice, DEVICE_KINDS } from "./devices"
import type { TrackKind } from "./types"

const eligibility: { kind: TrackKind; accepted: boolean }[] = [
  { kind: "audio", accepted: true },
  { kind: "midi", accepted: true },
  { kind: "group", accepted: false },
  { kind: "return", accepted: false },
  { kind: "main", accepted: false },
]
it.each(eligibility)("accepts $kind for audio only when $accepted", ({ kind, accepted }) => {
  expect(canAcceptAudioDrop({ kind })).toBe(accepted)
})

it("does not mistake any existing effect device for a sound-source instrument", () => {
  const midi = createTrack("midi", [], undefined, 70)
  midi.devices = DEVICE_KINDS.map(createDevice)
  expect(canAcceptAudioDrop(midi)).toBe(true)
})

it("does not convert a MIDI instrument track into audio on drop", () => {
  const midi = createTrack("midi", [], undefined, 70)
  midi.devices = [
    {
      id: "instrument",
      kind: "external",
      enabled: true,
      collapsed: false,
      plugin: {
        catalogId: "a".repeat(64),
        format: "clap",
        classId: "synth",
        name: "Synth",
        vendor: "Test",
        version: "1",
        role: "instrument",
      },
      stateRef: null,
      parameters: [],
    },
  ]
  expect(canAcceptAudioDrop(midi)).toBe(false)
})
