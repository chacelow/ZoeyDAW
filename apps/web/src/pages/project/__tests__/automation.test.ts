import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { beforeEach, describe, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "../adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
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

  it("creates only the chosen real target and keeps independent mixer and device envelopes", () => {
    projectActions.setAutomationTarget("3-audio", { kind: "mixer", parameter: "pan" })
    projectActions.setAutomationPoint("3-audio", "3-audio-mixer-pan", { bar: 5, value: 0.75 })
    let track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
    expect(
      track.automation.find(lane => lane.target.kind === "mixer" && lane.target.parameter === "pan")
        ?.points
    ).toHaveLength(2)
    projectActions.setAutomationTarget("3-audio", null)
    projectActions.setAutomationPoint("3-audio", "3-audio-mixer-volume-fake", {
      bar: 2,
      value: 0.5,
    })
    expect(
      useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!.automation
    ).toEqual(track.automation)
    const filter = {
      id: "filter-test",
      kind: "filter",
      enabled: true,
      collapsed: false,
      frequency: 1000,
      resonance: 0.2,
    } as const
    projectActions.updateTrack("3-audio", { devices: [filter] })
    projectActions.setAutomationTarget("3-audio", {
      kind: "device",
      deviceId: filter.id,
      parameter: "frequency",
    })
    projectActions.addAutomationLane("3-audio")
    projectActions.setAutomationPoint("3-audio", "3-audio-device-filter-test-frequency", {
      bar: 3,
      value: 0.25,
    })
    track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
    expect(track.automation.find(lane => lane.target.kind === "device")?.points).toEqual([
      { id: expect.any(String), bar: 3, value: 0.25 },
    ])
    expect(
      track.automation.find(
        lane => lane.target.kind === "mixer" && lane.target.parameter === "volume"
      )?.points
    ).toHaveLength(3)
    projectActions.setAutomationTarget("3-audio", {
      kind: "device",
      deviceId: filter.id,
      parameter: "timeMs",
    })
    expect(useProjectState.getState().session.automationTargets["3-audio"]).toEqual({
      kind: "device",
      deviceId: filter.id,
      parameter: "frequency",
    })
  })
  it("keeps a device lane's normalized points through undo and removes them with the device", () => {
    const trackId = "3-audio"
    projectActions.updateTrack(trackId, {
      devices: [
        {
          id: "filter-1",
          kind: "filter",
          enabled: true,
          collapsed: false,
          frequency: 1250,
          resonance: 0.25,
        },
      ],
    })
    const target = { kind: "device", deviceId: "filter-1", parameter: "frequency" } as const
    projectActions.setAutomationTarget(trackId, target)
    projectActions.addAutomationLane(trackId)
    projectActions.setAutomationPoint(trackId, "3-audio-device-filter-1-frequency", {
      bar: 4,
      value: 0.5,
    })
    expect(
      useProjectState
        .getState()
        .document.tracks.find(item => item.id === trackId)
        ?.automation.find(lane => lane.target.kind === "device")?.points
    ).toHaveLength(1)
    projectActions.undo()
    expect(
      useProjectState
        .getState()
        .document.tracks.find(item => item.id === trackId)
        ?.automation.find(lane => lane.target.kind === "device")
    ).toBeUndefined()
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
