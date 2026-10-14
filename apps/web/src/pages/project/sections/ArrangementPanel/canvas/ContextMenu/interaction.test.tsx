// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { arrangementScene } from "../scene"
import { AutomationValueEditor } from "../interactions/automation/ValueEditor"
import { ClipNameEditor } from "../interactions/clip/NameEditor"
import { useSceneSync } from "../useSceneSync"
import { CanvasContextMenu } from "."

function SceneSync() {
  useSceneSync()
  return null
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  const state = useProjectState.getState()
  arrangementScene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
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
  arrangementScene.setTargetSelection({ kind: "none" })
})
afterEach(() => {
  cleanup()
  arrangementScene.setTargetSelection({ kind: "none" })
})

it("activates Edit value from the real menu and keeps input focus after the popup closes", async () => {
  const view = render(
    <StrictMode>
      <CanvasContextMenu
        getTarget={() => ({
          kind: "automation-point",
          trackId: "3-audio",
          laneId: "3-audio-volume",
          pointId: "peak",
        })}
      >
        <canvas aria-label="Arrangement automation canvas" />
      </CanvasContextMenu>
      <AutomationValueEditor />
    </StrictMode>
  )
  const canvas = view.container.querySelector("canvas")!
  fireEvent.contextMenu(canvas, { clientX: 192, clientY: 200 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "arrangement.editAutomationValue" }))
  const input = await screen.findByRole("textbox", { name: "arrangement.editAutomationValue" })
  await waitFor(() => expect(document.activeElement).toBe(input))
  fireEvent.change(input, { target: { value: "-20 dB" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await act(async () => {})
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "3-audio")!
      .automation[0].points.find(point => point.id === "peak")?.value
  ).toBeCloseTo(40 / 66)
})

it("creates and renames a Pattern through menus without activating the temporary editor", async () => {
  const view = render(
    <StrictMode>
      <SceneSync />
      <CanvasContextMenu
        getTarget={() => {
          const id = useProjectState.getState().session.selectedClipIds[0]
          return id
            ? { kind: "clip", clipId: id, clipIds: [id] }
            : { kind: "clip-lane", trackId: "4-midi", bar: 5 }
        }}
      >
        <canvas aria-label="Arrangement clip canvas" />
      </CanvasContextMenu>
      <ClipNameEditor />
    </StrictMode>
  )
  const canvas = view.container.querySelector("canvas")!
  fireEvent.contextMenu(canvas, { clientX: 96, clientY: 280 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "arrangement.createPatternClip" }))
  const created = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
    .clips[0]
  expect(created).toMatchObject({ kind: "pattern", startBar: 5 })
  expect(useProjectState.getState().session.editingClipId).toBeNull()
  fireEvent.contextMenu(canvas, { clientX: 96, clientY: 280 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "arrangement.rename" }))
  const input = await screen.findByRole("textbox", { name: "arrangement.rename" })
  await waitFor(() => expect(document.activeElement).toBe(input))
  fireEvent.change(input, { target: { value: "Pattern variation" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!.clips[0].label
  ).toBe("Pattern variation")
  expect(useProjectState.getState().session.editingClipId).toBeNull()
})
