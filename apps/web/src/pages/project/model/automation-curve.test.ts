import { describe, expect, it } from "vitest"
import {
  automationSourceValue,
  automationValueAt,
  interpolateAutomation,
  normalizedAutomationValue,
} from "./automation-curve"
import { parseProject, stringifyProject } from "./persistence"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"

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
    expect(automationSourceValue("volume", normalizedAutomationValue("volume", -12))).toBeCloseTo(
      -12
    )
    expect(automationSourceValue("pan", normalizedAutomationValue("pan", -0.6))).toBeCloseTo(-0.6)
  })

  it("round-trips bounded curves and rejects non-finite and out-of-range snapshot curves", () => {
    const document = createMockDocument()
    const lane = document.tracks.find(track => track.id === "3-audio")?.automation[0]
    if (!lane) throw new Error("Missing automation fixture")
    lane.points[0].curve = -0.75
    const workspace = createMockWorkspace()
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
