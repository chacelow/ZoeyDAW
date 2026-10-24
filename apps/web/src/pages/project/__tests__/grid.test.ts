import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { useArrangementKeyboard } from "../sections/ArrangementPanel/Timeline/useArrangementKeyboard"
import { snapBar } from "../sections/ArrangementPanel/Grid/geometry"
import { deriveGridPlan, gridZoomLimit, noteGridBars } from "@zoeydaw/project-core/grid"
import { createClip } from "@zoeydaw/project-core/reducers"
import { parseProject, stringifyProject } from "@zoeydaw/project-core/persistence"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
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
  it("projects triplets through the same cell used by snapping, without changing document", () => {
    const before = useProjectState.getState().document
    projectActions.setGrid({ mode: "fixed", bars: 1 / 8 })
    projectActions.toggleTriplet()
    const grid = useProjectState.getState().workspace.grid
    const plan = deriveGridPlan(grid, 1024, 4, 4)
    expect(plan).toMatchObject({ cellBars: 1 / 12, label: "1/8T" })
    expect(snapBar(1 + 0.6 * plan.cellBars, true, plan.cellBars, 129)).toBe(1 + plan.cellBars)
    expect(useProjectState.getState().document).toBe(before)
    projectActions.adjustGrid(1)
    expect(useProjectState.getState().workspace.grid.triplet).toBe(true)
    projectActions.setDenominator(8)
    expect(useProjectState.getState().workspace.grid.triplet).toBe(true)
  })

  it("toggles fixed at the current adaptive cell and retains triplets across mode changes", () => {
    const current = useProjectState.getState().workspace
    projectActions.toggleTriplet()
    const projected = deriveGridPlan(
      useProjectState.getState().workspace.grid,
      current.pxPerBar,
      4,
      4
    )
    projectActions.toggleFixedGrid()
    expect(
      deriveGridPlan(useProjectState.getState().workspace.grid, current.pxPerBar, 4, 4).cellBars
    ).toBe(projected.cellBars)
    projectActions.toggleFixedGrid()
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "medium",
      triplet: true,
    })
  })

  it("round-trips true triplets, accepts old snapshots, rejects malformed triplets", () => {
    const old = parseProject(
      JSON.stringify({
        version: 3,
        document: createMockDocument(DEFAULT_TRACK_HEIGHT),
        workspace: createMockWorkspace(),
      })
    )
    expect(old.workspace.grid.triplet).toBeUndefined()
    projectActions.toggleTriplet()
    const state = useProjectState.getState()
    const restored = parseProject(stringifyProject(state.document, state.workspace))
    const originalDocument = parseProject(
      stringifyProject(state.document, createMockWorkspace())
    ).document
    expect(restored.workspace.grid.triplet).toBe(true)
    expect(restored.document).toEqual(originalDocument)
    for (const triplet of ["true", 1, null]) {
      expect(() =>
        parseProject(
          JSON.stringify({
            version: 3,
            document: createMockDocument(DEFAULT_TRACK_HEIGHT),
            workspace: {
              ...createMockWorkspace(),
              grid: { mode: "adaptive", density: "medium", triplet },
            },
          })
        )
      ).toThrow()
    }
  })

  it("changes only density on Ctrl+1/2, not zoom or camera", () => {
    const { unmount } = renderHook(() => useArrangementKeyboard())
    const camera = useProjectState.getState().workspace
    const surface = document.createElement("div")
    surface.dataset.arrangementPanel = ""
    document.body.append(surface)
    surface.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Digit1", key: "1", ctrlKey: true, bubbles: true })
    )
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "narrow",
    })
    surface.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Digit2", key: "2", metaKey: true, bubbles: true })
    )
    expect(useProjectState.getState().workspace.grid).toEqual({
      mode: "adaptive",
      density: "medium",
    })
    expect(useProjectState.getState().workspace.pxPerBar).toBe(camera.pxPerBar)
    expect(useProjectState.getState().workspace.scrollX).toBe(camera.scrollX)
    unmount()
    surface.remove()
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

  it("migrates legacy snapshots to fixed preference without gridBars", () => {
    const legacy = parseProject(
      JSON.stringify({
        version: 1,
        document: createMockDocument(DEFAULT_TRACK_HEIGHT),
        workspace: { ...createMockWorkspace(), gridBars: 0.25 },
      })
    )
    expect(legacy.workspace.grid).toEqual({ mode: "fixed", bars: 0.25 })
    const saved = JSON.parse(stringifyProject(legacy.document, legacy.workspace))
    expect(saved.workspace.grid).toEqual({ mode: "fixed", bars: 0.25 })
    expect(saved.workspace).not.toHaveProperty("gridBars")
  })

  it("rejects malformed v2 grid preference", () => {
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 3,
          document: createMockDocument(DEFAULT_TRACK_HEIGHT),
          workspace: { ...createMockWorkspace(), grid: { mode: "adaptive", density: "imaginary" } },
        })
      )
    ).toThrow()
  })

  it("rejects fixed cells below the fine-duration floor", () => {
    expect(() =>
      parseProject(
        JSON.stringify({
          version: 3,
          document: createMockDocument(DEFAULT_TRACK_HEIGHT),
          workspace: { ...createMockWorkspace(), grid: { mode: "fixed", bars: Number.MIN_VALUE } },
        })
      )
    ).toThrow()
  })
})
