import { describe, expect, it } from "vitest"
import { parseAutomationClipboard } from "./clipboard"

describe("automation clipboard boundary", () => {
  it("accepts a distinct envelope payload and preserves bounded curve data in bar order", () => {
    const payload = {
      kind: "automation",
      version: 2,
      target: { kind: "mixer", parameter: "pan" },
      points: [
        { id: "right", bar: 5, value: 1, curve: -0.5 },
        { id: "left", bar: 2, value: 0 },
      ],
    }
    expect(parseAutomationClipboard(JSON.stringify(payload))).toEqual({
      target: { kind: "mixer", parameter: "pan" },
      points: [payload.points[1], payload.points[0]],
    })
  })

  it("does not interpret clips or invalid envelope points as automation", () => {
    const envelope = {
      kind: "automation",
      version: 2,
      target: { kind: "mixer", parameter: "volume" },
      points: [{ id: "one", bar: 1, value: 0.5 }],
    }
    for (const changed of [
      { ...envelope, kind: "clips" },
      { ...envelope, points: [{ id: "one", bar: 1, value: Infinity }] },
      { ...envelope, points: [{ id: "one", bar: 1, value: 0.5, curve: 2 }] },
      { ...envelope, points: [...envelope.points, ...envelope.points] },
    ]) {
      expect(parseAutomationClipboard(JSON.stringify(changed))).toBeNull()
    }
  })
})
