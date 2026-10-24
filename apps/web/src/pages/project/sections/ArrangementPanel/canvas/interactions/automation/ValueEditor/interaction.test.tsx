import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { AutomationValueEditor } from "."
import { activeAutomationRows, automationY } from "../geometry"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
  const state = useProjectState.getState()
  arrangementScene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  arrangementScene.setViewport({
    pxPerBar: 24,
    scrollX: 0,
    scrollY: 0,
    width: 1000,
    height: 700,
    dpr: 1,
  })
  arrangementScene.setAutomationDisplay(
    { "3-audio": { kind: "mixer", parameter: "volume" } },
    {},
    true
  )
  arrangementScene.setTargetSelection({
    kind: "automation-value",
    trackId: "3-audio",
    laneId: "3-audio-volume",
    placement: "primary",
    pointId: "peak",
    pointIds: ["peak", "tail"],
  })
})
afterEach(() => {
  cleanup()
  arrangementScene.setTargetSelection({ kind: "none" })
})

it("keeps numeric editing focused through StrictMode and moves the selected envelope relatively as one undo", () => {
  const view = render(
    <StrictMode>
      <AutomationValueEditor />
    </StrictMode>
  )
  const input = view.container.querySelector("input")
  if (!input) {
    throw new Error("Value editor disappeared during mount")
  }
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: "-20 dB" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const points = () =>
    useProjectState.getState().document.tracks.find(track => track.id === "3-audio")!.automation[0]
      .points
  expect(points().find(point => point.id === "peak")?.value).toBeCloseTo(40 / 66)
  expect(points().find(point => point.id === "tail")?.value).toBeCloseTo(0.5 + 40 / 66 - 0.85)
  expect(arrangementScene.get().targetSelection).toMatchObject({
    kind: "automation",
    pointIds: ["peak", "tail"],
  })
  act(() => projectActions.undo())
  expect(points().map(point => point.value)).toEqual([0.35, 0.85, 0.5])
})

it("Escape cancels typed input without changing the envelope", () => {
  const view = render(
    <StrictMode>
      <AutomationValueEditor />
    </StrictMode>
  )
  const input = view.container.querySelector("input")
  if (!input) {
    throw new Error("Value editor disappeared during mount")
  }
  fireEvent.change(input, { target: { value: "0 dB" } })
  fireEvent.keyDown(input, { key: "Escape" })
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(arrangementScene.get().targetSelection.kind).toBe("automation")
})

for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
  it(`does not publish or close a composing value (${JSON.stringify(composition)})`, () => {
    const view = render(<AutomationValueEditor />)
    const input = view.getByRole("textbox")
    fireEvent.change(input, { target: { value: "-20 dB" } })
    for (const key of ["Enter", "Escape"]) {
      expect(fireEvent.keyDown(input, { key, ...composition })).toBe(true)
      expect(document.activeElement).toBe(input)
      expect(arrangementScene.get().targetSelection.kind).toBe("automation-value")
      expect(useProjectState.getState().session.canUndo).toBe(false)
    }
    fireEvent.keyDown(input, { key: "Enter" })
    expect(arrangementScene.get().targetSelection.kind).toBe("automation")
    expect(useProjectState.getState().session.canUndo).toBe(true)
  })
}

for (const value of ["", "not a number", "Infinity"]) {
  it(`does not publish an invalid automation value ${JSON.stringify(value)}`, () => {
    const view = render(<AutomationValueEditor />)
    fireEvent.change(view.getByRole("textbox"), { target: { value } })
    fireEvent.keyDown(view.getByRole("textbox"), { key: "Enter" })
    expect(useProjectState.getState().session.canUndo).toBe(false)
    expect(arrangementScene.get().targetSelection.kind).toBe("automation")
  })
}

it("edits filter frequency in Hz while leaving mixer points unchanged", () => {
  projectActions.updateTrack("3-audio", {
    devices: [
      {
        id: "filter-1",
        kind: "filter",
        enabled: true,
        collapsed: false,
        frequency: 1000,
        resonance: 0.2,
      },
    ],
  })
  projectActions.setAutomationTarget("3-audio", {
    kind: "device",
    deviceId: "filter-1",
    parameter: "frequency",
  })
  projectActions.setAutomationPoint("3-audio", "3-audio-device-filter-1-frequency", {
    id: "frequency-point",
    bar: 4,
    value: 0.25,
  })
  const state = useProjectState.getState()
  arrangementScene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: state.document.transport,
    media: state.document.media,
    patterns: state.document.patterns,
    markers: state.document.markers,
    loop: state.document.transport.loop,
    tracks: state.document.tracks,
  })
  arrangementScene.setAutomationDisplay(
    { "3-audio": { kind: "device", deviceId: "filter-1", parameter: "frequency" } },
    {},
    true
  )
  arrangementScene.setTargetSelection({
    kind: "automation-value",
    trackId: "3-audio",
    laneId: "3-audio-device-filter-1-frequency",
    placement: "primary",
    pointId: "frequency-point",
    pointIds: ["frequency-point"],
  })
  const view = render(<AutomationValueEditor />)
  const input = view.container.querySelector("input")
  if (!input) throw new Error("Missing frequency editor")
  expect(input.value).toContain("Hz")
  fireEvent.change(input, { target: { value: "2000 Hz" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const track = useProjectState.getState().document.tracks.find(item => item.id === "3-audio")!
  expect(track.automation.find(lane => lane.target.kind === "device")?.points[0].value).toBeCloseTo(
    (2000 - 20) / (20000 - 20)
  )
  expect(
    track.automation.find(
      lane => lane.target.kind === "mixer" && lane.target.parameter === "volume"
    )?.points[0].value
  ).toBe(0.35)
  act(() => projectActions.undo())
  expect(
    useProjectState
      .getState()
      .document.tracks.find(item => item.id === "3-audio")
      ?.automation.find(lane => lane.target.kind === "device")?.points[0].value
  ).toBe(0.25)
})

it("positions value editing on the selected extra row when the primary uses the same envelope", () => {
  const target = { kind: "mixer", parameter: "volume" } as const
  arrangementScene.setAutomationDisplay({ "3-audio": target }, { "3-audio": [target] }, true)
  const rows = activeAutomationRows(arrangementScene.get()).filter(
    row => row.track.id === "3-audio"
  )
  expect(rows.map(row => row.placement)).toEqual(["primary", "extra"])
  arrangementScene.setTargetSelection({
    kind: "automation-value",
    trackId: "3-audio",
    laneId: "3-audio-volume",
    placement: "extra",
    pointId: "peak",
    pointIds: ["peak"],
  })
  const view = render(<AutomationValueEditor />)
  const input = view.container.querySelector("input")
  if (!input) throw new Error("Missing extra-row value editor")
  expect(input.style.top).toBe(`${Math.max(0, automationY(rows[1], 0.85) - 10)}px`)
  expect(Number.parseFloat(input.style.top)).toBeGreaterThan(automationY(rows[0], 0.85))
  fireEvent.change(input, { target: { value: "-20 dB" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .automation[0].points.find(point => point.id === "peak")?.value
  ).toBeCloseTo(40 / 66)
  expect(arrangementScene.get().targetSelection).toMatchObject({
    kind: "automation",
    placement: "extra",
  })
})
