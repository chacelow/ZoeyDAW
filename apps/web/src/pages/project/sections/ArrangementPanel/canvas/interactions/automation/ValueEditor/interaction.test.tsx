// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { AutomationValueEditor } from "."

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  const state = useProjectState.getState()
  arrangementScene.setMusic({
    bars: 128,
    grid: state.workspace.grid,
    transport: state.document.transport,
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
  arrangementScene.setAutomationParameters({ "3-audio": "volume" })
  arrangementScene.setTargetSelection({
    kind: "automation-value",
    trackId: "3-audio",
    laneId: "3-audio-volume",
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
