// @vitest-environment jsdom
import { StrictMode } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/pages/project/adapters/fixtures"
import { arrangementScene } from "@/pages/project/sections/ArrangementPanel/canvas/scene"
import { ClipNameEditor } from "."

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
  arrangementScene.setTargetSelection({ kind: "clip", id: "trager-1", phase: "renaming" })
})
afterEach(() => {
  cleanup()
  arrangementScene.setTargetSelection({ kind: "none" })
})

it("renames in the card title through StrictMode, without opening detail, as one undo", () => {
  const view = render(
    <StrictMode>
      <ClipNameEditor />
    </StrictMode>
  )
  const input = view.container.querySelector("input")
  if (!input) throw new Error("Missing in-card rename input")
  expect(document.activeElement).toBe(input)
  expect(useProjectState.getState().session.editingClipId).toBeNull()
  fireEvent.change(input, { target: { value: "Verse notes" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const clip = () =>
    useProjectState.getState().document.tracks.find(track => track.id === "trager")!.clips[0]
  expect(clip().label).toBe("Verse notes")
  expect(arrangementScene.get().targetSelection).toMatchObject({ kind: "clip", phase: "selected" })
  act(() => projectActions.undo())
  expect(clip().label).toBeUndefined()
})

it("Escape discards the typed label without changing history or opening detail", () => {
  const view = render(
    <StrictMode>
      <ClipNameEditor />
    </StrictMode>
  )
  const input = view.container.querySelector("input")
  if (!input) throw new Error("Missing in-card rename input")
  fireEvent.change(input, { target: { value: "Discard" } })
  fireEvent.keyDown(input, { key: "Escape" })
  expect(useProjectState.getState().session).toMatchObject({ canUndo: false, editingClipId: null })
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "trager")!.clips[0].label
  ).toBeUndefined()
})
