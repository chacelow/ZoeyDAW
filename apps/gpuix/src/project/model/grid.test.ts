import { beforeEach, describe, expect, it } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import { snapBar } from "./grid-geometry"
import { deriveGridPlan, gridZoomLimit, noteGridBars } from "./grid"
import { createClip } from "./reducers"
import { parseProject, stringifyProject } from "./persistence"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("adaptive arrangement grid", () => {
  it("projects zoom without changing preference, reaching a legible 1/16384 cell", () => {
    const settings = { mode: "adaptive", density: "narrowest" } as const
    const near = deriveGridPlan(settings, 128, 4, 4)
    const far = deriveGridPlan(settings, gridZoomLimit(4, 4), 4, 4)
    expect(near.cellBars).toBeGreaterThan(far.cellBars)
    expect(far).toMatchObject({ cellBars: 1 / 16_384, label: "1/16384" })
    expect(far.cellBars * gridZoomLimit(4, 4)).toBe(8)
    expect(settings).toEqual({ mode: "adaptive", density: "narrowest" })
  })

  it("retains the finest clip duration in a 32/1 meter", () => {
    const cell = noteGridBars(16_384, 32, 1)
    expect(createClip("audio", 1, cell).lengthBars).toBe(cell)
    expect(createClip("midi", 1, cell).lengthBars).toBe(cell)
  })

  it("keeps overview cells legible and coarse cells bar-aligned", () => {
    const widest = deriveGridPlan({ mode: "adaptive", density: "widest" }, 1200 / 128, 4, 4)
    expect(widest.cellBars).toBe(16)
    expect((widest.cellBars * 1200) / 128).toBeGreaterThanOrEqual(128)
    const narrowest = deriveGridPlan({ mode: "adaptive", density: "narrowest" }, 1200 / 128, 4, 4)
    expect(narrowest.cellBars).toBe(1)
  })

  it("matches note labels and physical cell widths in 4/4 and 4/8", () => {
    const settings = { mode: "adaptive", density: "narrowest" } as const
    const fourFour = deriveGridPlan(settings, gridZoomLimit(4, 4), 4, 4)
    const fourEight = deriveGridPlan(settings, gridZoomLimit(4, 8), 4, 8)
    expect(fourFour.label).toBe("1/16384")
    expect(fourEight.label).toBe("1/16384")
    expect(fourFour.cellBars * gridZoomLimit(4, 4)).toBe(8)
    expect(fourEight.cellBars * gridZoomLimit(4, 8)).toBe(8)
  })

  it("changes only density through adjustGrid, not zoom or camera", () => {
    const camera = useProjectState.getState().workspace
    projectActions.adjustGrid(-1)
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "narrow",
    })
    projectActions.adjustGrid(1)
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "medium",
    })
    expect(useProjectState.getState().workspace.pxPerBar).toBe(camera.pxPerBar)
    expect(useProjectState.getState().workspace.scrollX).toBe(camera.scrollX)
  })

  it("retains explicit fixed note duration across 4/4 and 4/8 meter changes", () => {
    projectActions.setGrid({ mode: "fixed", bars: noteGridBars(256, 4, 4) })
    projectActions.setDenominator(8)
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "fixed",
      bars: noteGridBars(256, 4, 8),
    })
    const cell = deriveGridPlan(useProjectState.getState().workspace.grid, 2048, 4, 8).cellBars
    expect(snapBar(1 + 1.6 * cell, true, cell, 129)).toBe(1 + 2 * cell)
    projectActions.setDenominator(4)
    expect(useProjectState.getState().workspace.grid).toEqual({ mode: "fixed", bars: 1 / 256 })
  })

  it("migrates legacy snapshots to fixed preference and serializes version 2", () => {
    const legacy = parseProject(
      JSON.stringify({
        version: 1,
        document: createMockDocument(),
        workspace: { ...createMockWorkspace(), gridBars: 0.25 },
      })
    )
    expect(legacy.workspace.grid).toEqual({ mode: "fixed", bars: 0.25 })
    const saved = JSON.parse(stringifyProject(legacy.document, legacy.workspace))
    expect(saved.version).toBe(2)
    expect(saved.workspace.grid).toEqual({ mode: "fixed", bars: 0.25 })
    expect(saved.workspace).not.toHaveProperty("gridBars")
  })

  it("rejects malformed v2 grid preference", () => {
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 2,
          document: createMockDocument(),
          workspace: { ...createMockWorkspace(), grid: { mode: "adaptive", density: "imaginary" } },
        })
      )
    ).toThrow()
  })

  it("rejects fixed cells below the fine-duration floor", () => {
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 2,
          document: createMockDocument(),
          workspace: { ...createMockWorkspace(), grid: { mode: "fixed", bars: Number.MIN_VALUE } },
        })
      )
    ).toThrow()
  })
})
