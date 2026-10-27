import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { arrangementScene } from "../scene"
import { AutomationValueEditor } from "../interactions/automation/ValueEditor"
import { ClipNameEditor } from "../interactions/clip/NameEditor"
import { useSceneSync } from "../useSceneSync"
import { CanvasContextMenu } from "."

function SceneSync() {
  useSceneSync(128)
  return null
}

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
    grid: { mode: "fixed", bars: 1 },
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
  arrangementScene.setTargetSelection({ kind: "none" })
})
afterEach(() => {
  cleanup()
  arrangementScene.setTargetSelection({ kind: "none" })
})

it("activates Edit value from the real menu and keeps input focus after the popup closes", async () => {
  arrangementScene.setAutomationDisplay({}, {}, true)
  const view = render(
    <StrictMode>
      <CanvasContextMenu
        getTarget={() => ({
          kind: "automation-point",
          trackId: "3-audio",
          laneId: "3-audio-volume",
          placement: "primary",
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

it("creates and renames a selected-range MIDI clip through menus", async () => {
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
  projectActions.setTimeSelection({ startBar: 3, endBar: 7, trackIds: ["4-midi"] })
  fireEvent.contextMenu(canvas, { clientX: 96, clientY: 280 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "arrangement.createMidiClip" }))
  const created = useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!
    .clips[0]
  expect(created).toMatchObject({ kind: "midi", startBar: 3, lengthBars: 4, loopBars: 4 })
  expect(useProjectState.getState().session.selectedClipIds).toEqual([created.id])
  expect(useProjectState.getState().session.clipEditorRequest).toBe(1)
  fireEvent.contextMenu(canvas, { clientX: 96, clientY: 280 })
  fireEvent.click(await screen.findByRole("menuitem", { name: "arrangement.rename" }))
  const input = await screen.findByRole("textbox", { name: "arrangement.rename" })
  await waitFor(() => expect(document.activeElement).toBe(input))
  fireEvent.change(input, { target: { value: "Pattern variation" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "4-midi")!.clips[0].label
  ).toBe("Pattern variation")
  expect(useProjectState.getState().session.clipEditorRequest).toBe(1)
})
