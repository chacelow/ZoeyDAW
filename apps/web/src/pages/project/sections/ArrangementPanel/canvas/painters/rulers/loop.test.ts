import { describe, expect, it } from "vitest"
import { createSceneStore } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { formatBarBeat, paintLoopRuler } from "./loop"
import type { GridTokens } from "../grid"

function paintedLabels(pxPerBar: number, numerator: number): string[] {
  const scene = createSceneStore()
  scene.setMusic({
    bars: 4,
    grid: { mode: "fixed", bars: 1 },
    transport: { bpm: 120, numerator, denominator: 4 },
    markers: [],
    loop: { enabled: false, startBar: 1, endBar: 3 },
    tracks: [],
  })
  scene.setViewport({ pxPerBar, scrollX: 0, scrollY: 0, width: 650, height: 240, dpr: 1 })
  const labels: string[] = []
  const context = {
    fillRect() {},
    fillText(value: string) {
      labels.push(value)
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  }
  const tokens: GridTokens = {
    foreground: "",
    mutedForeground: "",
    surface: "",
    surfaceAlt: "",
    ruler: "",
    line: "",
    gridBar: "",
    gridMinor: "",
    gridMajor: "",
    primary: "",
  }
  paintLoopRuler(context as unknown as CanvasRenderingContext2D, scene.get(), tokens)
  return labels
}

describe("bar ruler labels", () => {
  it("omits the first beat number and counts the transport numerator", () => {
    expect(formatBarBeat(1, 1)).toBe("1")
    expect(paintedLabels(224, 4).slice(0, 6)).toEqual(["1", "1.2", "1.3", "1.4", "2", "2.2"])
    expect(paintedLabels(168, 3).slice(0, 5)).toEqual(["1", "1.2", "1.3", "2", "2.2"])
  })

  it("labels beats and sixteenths at maximum zoom without painting offscreen bars", () => {
    expect(paintedLabels(4096, 4).slice(0, 3)).toEqual(["1", "1.1.2", "1.1.3"])
  })

  it("keeps whole-bar spacing when beats are too close to read", () => {
    expect(paintedLabels(200, 4).slice(0, 4)).toEqual(["1", "2", "3", "4"])
    expect(paintedLabels(25, 4).slice(0, 3)).toEqual(["1", "5"])
  })
})
