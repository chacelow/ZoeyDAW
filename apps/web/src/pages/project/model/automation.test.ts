import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

describe("automation envelope edits", () => {
  it("replaces a breakpoint at the same musical time instead of creating an ambiguous segment", () => {
    projectActions.setAutomationPoint("3-audio", "3-audio-volume", { bar: 1, value: 0.6 })
    const { points } = useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .automation.find(lane => lane.id === "3-audio-volume")!
    expect(points.filter(point => point.bar === 1)).toEqual([{ id: "fade-up", bar: 1, value: 0.6 }])
    projectActions.undo()
    expect(
      useProjectState
        .getState()
        .document.tracks.find(track => track.id === "3-audio")!
        .automation.find(lane => lane.id === "3-audio-volume")!.points[0]
    ).toMatchObject({ id: "fade-up", value: 0.35 })
  })

  it("creates the selected parameter without interpreting an opaque envelope id", () => {
    projectActions.setAutomationParameter("4-midi", "pan")
    projectActions.setAutomationPoint("4-midi", "new-envelope", { bar: 5, value: 0.75 })
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!.automation
    ).toEqual([
      {
        id: "new-envelope",
        parameter: "pan",
        points: [{ id: expect.any(String), bar: 5, value: 0.75 }],
      },
    ])
  })
  it("moves selected points as one sorted collision-free edit with one undo", () => {
    const track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
    const lane = track.automation.find(item => item.id === "3-audio-volume")!
    projectActions.replaceAutomationPoints(track.id, lane.id, [
      { id: "fade-up", bar: 4, value: 0.4 },
      { id: "peak", bar: 8, value: 0.9, curve: -0.5 },
      { id: "tail", bar: 12, value: 0.3 },
    ])
    const moved = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
      .automation[0].points
    expect(moved.map(point => point.bar)).toEqual([4, 8, 12])
    expect(moved[1].curve).toBe(-0.5)
    projectActions.undo()
    expect(
      useProjectState
        .getState()
        .document.tracks.find(item => item.id === "3-audio")!
        .automation[0].points.map(point => point.bar)
    ).toEqual([1, 9, 17])
  })

  it("rejects out-of-domain curves and coincident breakpoints atomically", () => {
    const track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
    const lane = track.automation[0]
    const before = lane.points
    projectActions.replaceAutomationPoints(track.id, lane.id, [
      { id: "a", bar: 2, value: 0.4 },
      { id: "b", bar: 2, value: 0.7 },
    ])
    projectActions.setAutomationPoint(track.id, lane.id, { bar: 3, value: 0.5, curve: 2 })
    expect(
      useProjectState.getState().document.tracks.find(item => item.id === track.id)!.automation[0]
        .points
    ).toEqual(before)
  })
})
