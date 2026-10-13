// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { createMockDocument, createMockWorkspace } from "./fixtures"
import { hydrateProject, projectActions, useProjectState } from "."

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

it("creates and moves a marker with one undoable document edit", () => {
  const before = useProjectState.getState().document.markers
  const id = projectActions.addMarker(10.25)
  expect(id).toBeDefined()
  if (!id) throw new Error("Marker creation failed")
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
    10.25
  )
  projectActions.updateMarker(id, { bar: 12, label: "Bridge" })
  expect(
    useProjectState.getState().document.markers.find(marker => marker.id === id)
  ).toMatchObject({ bar: 12, label: "Bridge" })
  projectActions.undo()
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
    10.25
  )
  projectActions.undo()
  expect(useProjectState.getState().document.markers).toEqual(before)
})

it("rejects invalid marker positions and no-op patches without changing history", () => {
  const id = projectActions.addMarker(4)
  if (!id) throw new Error("Marker creation failed")
  projectActions.addMarker(Number.NaN)
  projectActions.updateMarker(id, { bar: Infinity })
  projectActions.updateMarker(id, { id: "forged", bar: 4 })
  expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.id).toBe(id)
  projectActions.undo()
  expect(useProjectState.getState().document.markers.some(marker => marker.id === id)).toBe(false)
})

it("deleting a marker is undoable and leaves unrelated markers intact", () => {
  const first = projectActions.addMarker(3)
  const second = projectActions.addMarker(8)
  if (!first || !second) throw new Error("Marker creation failed")
  projectActions.deleteMarker(first)
  expect(useProjectState.getState().document.markers.some(marker => marker.id === first)).toBe(
    false
  )
  expect(useProjectState.getState().document.markers.some(marker => marker.id === second)).toBe(
    true
  )
  projectActions.undo()
  expect(useProjectState.getState().document.markers.some(marker => marker.id === first)).toBe(true)
})
