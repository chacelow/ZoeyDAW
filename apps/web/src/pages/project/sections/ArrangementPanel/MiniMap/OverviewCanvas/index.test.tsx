// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { createMockDocument } from "@zoeydaw/project-runtime/testing"
import type { MidiPattern, PatternClip } from "@zoeydaw/project-core/types"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { OverviewCanvas } from "."

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("repaints shared Pattern notes while preserving each minimap placement and trim", () => {
  const fixture = createMockDocument(DEFAULT_TRACK_HEIGHT)
  const owner = fixture.tracks.find(track => track.kind === "midi")!
  const clips: PatternClip[] = [
    { id: "first", kind: "pattern", patternId: "shared", startBar: 1, lengthBars: 1 },
    {
      id: "second",
      kind: "pattern",
      patternId: "shared",
      startBar: 3,
      lengthBars: 1,
      sourceOffsetBars: 0.5,
    },
  ]
  const tracks = [{ ...owner, clips }]
  const original: MidiPattern[] = [
    {
      id: "shared",
      loopBars: 1,
      notes: [{ pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 100 }],
    },
  ]
  const edited: MidiPattern[] = [
    {
      id: "shared",
      loopBars: 1,
      notes: [{ pitch: 67, startBeat: 2, lengthBeats: 0.5, velocity: 100 }],
    },
  ]
  const strokes: number[][] = []
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    setTransform() {},
    clearRect() {},
    fillRect(x: number, _y: number, width: number, height: number) {
      if (height === 3) strokes.push([x, width])
    },
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context)
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 160, 40)
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }))
  const properties = { tracks, markers: [], numerator: 4, bars: 4, dividers: false }
  const view = render(<OverviewCanvas {...properties} patterns={original} />)
  expect(strokes).toEqual([
    [0, 10],
    [100, 10],
  ])
  strokes.length = 0
  view.rerender(<OverviewCanvas {...properties} patterns={edited} />)
  expect(strokes).toEqual([
    [20, 5],
    [80, 5],
  ])
  strokes.length = 0
  view.rerender(<OverviewCanvas {...properties} patterns={original} />)
  expect(strokes).toEqual([
    [0, 10],
    [100, 10],
  ])
})
