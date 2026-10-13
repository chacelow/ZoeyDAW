import { describe, expect, it } from "vitest"
import { createMockDocument } from "@/pages/project/adapters/fixtures"
import type { LoopRegion, Marker, Track } from "@/pages/project/model/types"
import { deriveGridPlan } from "@/pages/project/model/grid"
import type { ArrangementScene } from "../scene"
import { BAR_RULER_HEIGHT, paintGrid, TIME_RULER_HEIGHT } from "./grid"

const tokens = {
  foreground: "#fff",
  mutedForeground: "#aaa",
  surface: "#1a1a1a",
  surfaceAlt: "#222",
  ruler: "#111",
  line: "#333",
  gridBar: "#2a2a2a",
  gridMinor: "#2a2a2a",
  gridMajor: "#444",
  primary: "#f00",
}

function makeScene(patch?: Partial<ArrangementScene>): ArrangementScene {
  const base: ArrangementScene = {
    revision: 0,
    viewport: { pxPerBar: 32, scrollX: 0, scrollY: 0, width: 640, height: 200, dpr: 1 },
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    gridPlan: deriveGridPlan({ mode: "fixed", bars: 1 }, 32, 4, 4),
    playback: { playing: false, insertionPoint: null },
    transport: { bpm: 120, numerator: 4, denominator: 4 },
    markers: [] as ReadonlyArray<Marker>,
    loop: { enabled: false, startBar: 1, endBar: 5 } as LoopRegion,
    tracks: [] as ReadonlyArray<Track>,
    previewTracks: null,
    clipDrag: null,
    clipResize: null,
    previewMarkers: null,
    previewLoop: null,
    targetSelection: { kind: "none" },
    automationParameters: {},
    selectedClipIds: new Set(),
    selectedTrackIds: new Set(),
    hoverClip: null,
    timeSelection: null,
  }
  return { ...base, ...patch }
}

type Call = [name: string, args: unknown[]]
function recordCtx() {
  const calls: Call[] = []
  const proxy = {
    _calls: calls,
    get fillStyle() {
      return ""
    },
    set fillStyle(v: string) {
      calls.push(["fillStyle=", [v]])
    },
    get strokeStyle() {
      return ""
    },
    set strokeStyle(v: string) {
      calls.push(["strokeStyle=", [v]])
    },
    get lineWidth() {
      return 1
    },
    set lineWidth(v: number) {
      calls.push(["lineWidth=", [v]])
    },
    get font() {
      return ""
    },
    set font(v: string) {
      calls.push(["font=", [v]])
    },
    get textBaseline() {
      return "" as CanvasTextBaseline
    },
    set textBaseline(v: CanvasTextBaseline) {
      calls.push(["textBaseline=", [v]])
    },
  }
  const methods = [
    "save",
    "restore",
    "setTransform",
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "closePath",
    "stroke",
    "fill",
    "fillText",
  ] as const
  for (const name of methods) {
    ;(proxy as unknown as Record<string, unknown>)[name] = (...args: unknown[]) =>
      calls.push([name, args])
  }
  return proxy as unknown as CanvasRenderingContext2D & { _calls: Call[] }
}

describe("grid painter", () => {
  it("reserves distinct marker and loop/bar bands plus the bottom time band", () => {
    const ctx = recordCtx()
    paintGrid(ctx, makeScene(), tokens)
    const fillRects = ctx._calls.filter(c => c[0] === "fillRect").map(c => c[1] as number[])
    expect(fillRects.some(r => r[1] === 0 && r[3] === 17)).toBe(true)
    expect(fillRects.some(r => r[1] === 17 && r[3] === 17)).toBe(true)
    expect(
      fillRects.some(r => r[1] === 200 - TIME_RULER_HEIGHT && r[3] === TIME_RULER_HEIGHT)
    ).toBe(true)
    expect(
      fillRects.some(
        r => r[1] === BAR_RULER_HEIGHT && r[3] === 200 - BAR_RULER_HEIGHT - TIME_RULER_HEIGHT
      )
    ).toBe(true)
  })

  it("draws marker ticks in the first lane and loop handles only in the second", () => {
    const ctx = recordCtx()
    paintGrid(
      ctx,
      makeScene({
        markers: [{ id: "section", bar: 3, label: "Section" }],
        loop: { enabled: true, startBar: 3, endBar: 6 },
      }),
      tokens
    )
    const calls = ctx._calls
    expect(
      calls.filter(
        ([name, args]) => name === "fillText" && args[0] === "Section" && args[2] === 17 / 2
      )
    ).toHaveLength(1)
    expect(
      calls.filter(([name, args]) => name === "fillRect" && args[1] === 17 && args[3] === 17)
    ).toHaveLength(2)
  })

  it("highlights only selected track rows when choosing a time span", () => {
    const tracks = createMockDocument().tracks
    const selected = tracks[0]
    if (!selected) throw new Error("Fixture must contain a group track")
    const ctx = recordCtx()
    paintGrid(
      ctx,
      makeScene({
        tracks,
        timeSelection: { startBar: 1, endBar: 3, trackIds: [selected.id] },
      }),
      tokens
    )
    const selectedFills = ctx._calls
      .filter(([name, args]) => name === "fillRect" && args[2] === 64)
      .map(([, args]) => args as number[])
    expect(selectedFills).toHaveLength(1)
    expect(selectedFills[0][3]).toBeGreaterThan(0)
    expect(selectedFills[0][3]).toBeLessThanOrEqual(selected.heightPx)
  })

  it("paints fine snapped cells at the same one-based origin, bounded by the viewport", () => {
    const ctx = recordCtx()
    paintGrid(
      ctx,
      makeScene({
        grid: { mode: "fixed", bars: 1 / 128 },
        gridPlan: deriveGridPlan({ mode: "fixed", bars: 1 / 128 }, 2048, 4, 4),
        viewport: {
          pxPerBar: 2048,
          scrollX: 2048 * 2,
          scrollY: 0,
          width: 640,
          height: 200,
          dpr: 1,
        },
      }),
      tokens
    )
    const gridLines = ctx._calls.filter(
      ([name, args]) => name === "moveTo" && args[1] === BAR_RULER_HEIGHT
    )
    expect(gridLines.some(([, args]) => args[0] === 16.5)).toBe(true)
    expect(gridLines.length).toBeLessThan(100)
  })

  it("bounds 1/16384 grid raster work at a distant logical scroll", () => {
    const ctx = recordCtx()
    const pxPerBar = 131072
    const cellBars = 1 / 16384
    paintGrid(
      ctx,
      makeScene({
        bars: 4096,
        grid: { mode: "adaptive", density: "narrowest" },
        gridPlan: deriveGridPlan({ mode: "adaptive", density: "narrowest" }, pxPerBar, 4, 4),
        viewport: {
          pxPerBar,
          scrollX: (2048 + cellBars * 7) * pxPerBar,
          scrollY: 0,
          width: 640,
          height: 200,
          dpr: 1,
        },
      }),
      tokens
    )
    const lines = ctx._calls.filter(
      ([name, args]) => name === "moveTo" && args[1] === BAR_RULER_HEIGHT
    )
    expect(lines.length).toBeLessThan(200)
    expect(lines.length).toBeGreaterThan(20)
  })

  it.each([
    { pxPerBar: 32, density: "wide", width: 128, major: [0.5, 64.5, 128.5], minor: [] },
    {
      pxPerBar: 32,
      density: "narrow",
      width: 128,
      major: [0.5, 64.5, 128.5],
      minor: [16.5, 32.5, 48.5, 80.5, 96.5, 112.5],
    },
    {
      pxPerBar: 128,
      density: "wide",
      width: 256,
      major: [0.5, 128.5, 256.5],
      minor: [64.5, 192.5],
    },
    {
      pxPerBar: 128,
      density: "narrow",
      width: 256,
      major: [0.5, 128.5, 256.5],
      minor: [
        16.5, 32.5, 48.5, 64.5, 80.5, 96.5, 112.5, 144.5, 160.5, 176.5, 192.5, 208.5, 224.5, 240.5,
      ],
    },
  ] as const)(
    "aligns numbered ruler and $density cells at $pxPerBar px/bar",
    ({ pxPerBar, density, width, major, minor }) => {
      const ctx = recordCtx()
      const grid = { mode: "adaptive", density } as const
      paintGrid(
        ctx,
        makeScene({
          grid,
          gridPlan: deriveGridPlan(grid, pxPerBar, 4, 4),
          viewport: { pxPerBar, scrollX: 0, scrollY: 0, width, height: 200, dpr: 1 },
        }),
        tokens
      )
      const lines = new Map<string, number[]>([
        [tokens.gridMajor, []],
        [tokens.gridMinor, []],
      ])
      let strokeStyle = ""
      for (const [name, args] of ctx._calls) {
        if (name === "strokeStyle=") strokeStyle = String(args[0])
        if (name === "moveTo" && args[1] === BAR_RULER_HEIGHT && typeof args[0] === "number")
          lines.get(strokeStyle)?.push(args[0])
      }
      expect(lines.get(tokens.gridMajor)).toEqual(major)
      expect(lines.get(tokens.gridMinor)).toEqual(minor)
    }
  )

  it("skips work when viewport has zero size", () => {
    const ctx = recordCtx()
    paintGrid(
      ctx,
      makeScene({
        viewport: { pxPerBar: 24, scrollX: 0, scrollY: 0, width: 0, height: 200, dpr: 1 },
      }),
      tokens
    )
    expect(ctx._calls).toHaveLength(0)
  })

  it("keeps pinned-track highlights below the rulers in a short viewport", () => {
    const ctx = recordCtx()
    const scene = makeScene({
      tracks: createMockDocument().tracks,
      selectedTrackIds: new Set(["main"]),
      timeSelection: { startBar: 1, endBar: 2, trackIds: ["main"] },
      viewport: { pxPerBar: 24, scrollX: 0, scrollY: 0, width: 100, height: 100, dpr: 1 },
    })
    paintGrid(ctx, scene, tokens)
    const crossesRuler = ctx._calls.some(
      ([name, [, y, , height]]) =>
        name === "fillRect" &&
        typeof y === "number" &&
        typeof height === "number" &&
        y < BAR_RULER_HEIGHT &&
        y + height > BAR_RULER_HEIGHT
    )
    expect(crossesRuler).toBe(false)
  })
})
