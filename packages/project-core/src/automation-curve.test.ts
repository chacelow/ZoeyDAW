import { describe, expect, it } from "vitest"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import {
  automationSourceValue,
  automationValueAt,
  interpolateAutomation,
  normalizedAutomationValue,
} from "./automation-curve"
import { parseProject, stringifyProject } from "./persistence"
import { automationTargetSource, isAutomationTarget } from "./automation-target"
import type { AutomationTarget } from "./types"

describe("automation interpolation", () => {
  it("holds endpoints and bends bounded monotone segments while retaining their exact breakpoints", () => {
    const points = [
      { id: "a", bar: 2, value: 0.2, curve: 0.75 },
      { id: "b", bar: 6, value: 0.8 },
    ]
    expect(automationValueAt(points, 1, 0.5)).toBe(0.2)
    expect(automationValueAt(points, 2, 0.5)).toBe(0.2)
    expect(automationValueAt(points, 6, 0.5)).toBe(0.8)
    expect(automationValueAt(points, 9, 0.5)).toBe(0.8)
    expect(automationValueAt(points, 4, 0.5)).toBeCloseTo(
      interpolateAutomation(0.2, 0.8, 0.5, 0.75)
    )
    expect(automationValueAt(points, 4, 0.5)).toBeLessThan(0.5)
    expect(interpolateAutomation(0.8, 0.2, 0.5, -1)).toBeGreaterThan(0.2)
  })

  it("maps the normalized envelope to real pan and decibel display domains", () => {
    const volume = { kind: "mixer", parameter: "volume" } as const
    const pan = { kind: "mixer", parameter: "pan" } as const
    const frequency = { kind: "device", deviceId: "filter-1", parameter: "frequency" } as const
    expect(automationSourceValue(volume, normalizedAutomationValue(volume, -12))).toBeCloseTo(-12)
    expect(automationSourceValue(pan, normalizedAutomationValue(pan, -0.6))).toBeCloseTo(-0.6)
    expect(
      automationSourceValue(frequency, normalizedAutomationValue(frequency, 1234))
    ).toBeCloseTo(1234)
  })

  it("round-trips exact native parameter identities and validates declared targets", () => {
    const document = createTestDocument()
    const track = document.tracks.find(track => track.id === "3-audio")
    if (!track) throw new Error("Missing audio fixture")
    const id = "18446744073709551615"
    track.devices = [
      {
        id: "external",
        kind: "external",
        enabled: true,
        collapsed: false,
        plugin: {
          catalogId: "a".repeat(64),
          format: "clap",
          classId: "fixture",
          name: "Fixture",
          vendor: "",
          version: "1",
          role: "effect",
        },
        stateRef: null,
        parameters: [{ id, normalized: 0.35 }],
      },
    ]
    const target: AutomationTarget = { kind: "device", deviceId: "external", parameter: id }
    track.automation = [
      { id: "native-envelope", target, points: [{ id: "point", bar: 1, value: 0.75 }] },
    ]
    expect(isAutomationTarget(target, track)).toBe(true)
    for (const parameter of ["9007199254740993", "gainDb", "018446744073709551615"])
      expect(isAutomationTarget({ ...target, parameter }, track)).toBe(false)
    expect(automationTargetSource(track, target)).toBe(0.35)
    expect(automationSourceValue(target, normalizedAutomationValue(target, 0.625))).toBe(0.625)
    const snapshot = stringifyProject(document, createTestWorkspace())
    expect(
      parseProject(snapshot).document.tracks.find(track => track.id === "3-audio")?.automation
    ).toEqual(track.automation)
    track.automation[0].points[0].value = 1.01
    expect(() => parseProject(stringifyProject(document, createTestWorkspace()))).toThrow()
  })

  it("round-trips bounded curves and rejects non-finite and out-of-range snapshot curves", () => {
    const document = createTestDocument()
    const lane = document.tracks.find(track => track.id === "3-audio")?.automation[0]
    if (!lane) {
      throw new Error("Missing automation fixture")
    }
    lane.points[0].curve = -0.75
    const workspace = createTestWorkspace()
    const snapshot = stringifyProject(document, workspace)
    expect(
      parseProject(snapshot).document.tracks.find(track => track.id === "3-audio")?.automation[0]
        .points[0].curve
    ).toBe(-0.75)
    for (const curve of [-1.01, 1.01, "NaN", null]) {
      const corrupt = JSON.parse(snapshot)
      corrupt.document.tracks.find(
        (track: { id: string }) => track.id === "3-audio"
      ).automation[0].points[0].curve = curve
      expect(() => parseProject(JSON.stringify(corrupt))).toThrow(
        "Invalid or unsupported project snapshot"
      )
    }
  })
})
