import { describe, expect, it } from "vitest"
import {
  projectTempoSections,
  secondsAtBar,
  barAtSeconds,
  tempoAtBar,
  clipSourceCoordinate,
  clipBarAtSourceCoordinate,
} from "./tempo-map"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import { normalizedAutomationValue } from "./automation-curve"
import { stringifyProject, parseProject } from "./persistence"
import { isAutomationTarget } from "./automation-target"
import { defaultAudioClipSettings } from "./audio-editor"
import type { AudioClip } from "./types"

describe("derived song tempo timebase", () => {
  it("integrates Main tempo automation and inverts times across changes", () => {
    const document = createTestDocument()
    const main = document.tracks.find(track => track.kind === "main")
    if (!main) throw new Error("Missing Main")
    const target = { kind: "mixer", parameter: "tempo" } as const
    main.automation = [
      {
        id: "tempo",
        target,
        points: [
          { id: "a", bar: 1, value: normalizedAutomationValue(target, 120) },
          { id: "b", bar: 3, value: normalizedAutomationValue(target, 240) },
        ],
      },
    ]
    const tempo = projectTempoSections(document.tracks, document.transport)
    const timebase = { ...document.transport, tempo }
    expect(tempoAtBar(timebase, 1)).toBeCloseTo(120)
    expect(tempoAtBar(timebase, 3)).toBeCloseTo(240)
    expect(secondsAtBar(timebase, 3)).toBeGreaterThan(2.77)
    expect(secondsAtBar(timebase, 3)).toBeLessThan(2.82)
    for (const bar of [1, 1.01, 2, 2.99, 3, 5, 100])
      expect(barAtSeconds(timebase, secondsAtBar(timebase, bar))).toBeCloseTo(bar, 10)
    expect(projectTempoSections(document.tracks, document.transport)).toBe(tempo)
    const restored = parseProject(stringifyProject(document, createTestWorkspace())).document
    expect(projectTempoSections(restored.tracks, restored.transport)).toEqual(tempo)
    expect(isAutomationTarget(target, main)).toBe(true)
    expect(isAutomationTarget(target, { kind: "audio" })).toBe(false)
  })
  it("retains the constant-tempo path and ignores non-Main tracks", () => {
    const document = createTestDocument()
    expect(projectTempoSections(document.tracks, document.transport)).toEqual([])
    expect(secondsAtBar(document.transport, 3)).toBe(4)
    expect(barAtSeconds(document.transport, 4)).toBe(3)
  })
  it("maps original-speed source markers and fades across tempo changes", () => {
    const timebase = {
      bpm: 120,
      numerator: 4,
      denominator: 4,
      tempo: [
        { bar: 1, bpm: 120 },
        { bar: 2, bpm: 240 },
      ],
    }
    const audio: AudioClip = {
      id: "audio",
      kind: "audio",
      sourceId: null,
      startBar: 1,
      lengthBars: 3,
      gainDb: 0,
      audioSettings: { ...defaultAudioClipSettings(120, { lengthBars: 3 }), warp: false },
    }
    expect(clipSourceCoordinate(audio, timebase, 2)).toBeCloseTo(1.5)
    expect(clipBarAtSourceCoordinate(audio, timebase, 1.5)).toBeCloseTo(2)
  })
})
