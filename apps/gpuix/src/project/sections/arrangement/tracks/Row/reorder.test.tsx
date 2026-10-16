import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { useRef } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { createTrack } from "@/project/model/reducers"
import { hydrateProject, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace, TEST_CREATION } from "@/project/adapters/fixtures"
import { layoutTrackRowsForViewport } from "../../core/layout"
import { useTrackReorder } from "./useTrackReorder"
import type { PublicInstance } from "@gpuix/react"
import type { TestRoot } from "@gpuix/react/testing"

const roots: TestRoot[] = []
const projectedIds = new Set(["3-audio", "4-midi", "boundary-target"])

function projectedRows() {
  return layoutTrackRowsForViewport(
    useProjectState.getState().document.tracks.filter(track => projectedIds.has(track.id)),
    0,
    300,
    DEFAULT_LAYOUT_TOKENS
  )
}

function ReorderSurface() {
  const container = useRef<PublicInstance | null>(null)
  const reorder = useTrackReorder(projectedRows(), container)
  const source = useProjectState
    .getState()
    .document.tracks.find(track => track.id === "boundary-target")
  if (!source) throw new Error("Missing drag source")
  return (
    <div
      ref={container}
      testId="reorder-container"
      style={{ width: 400, height: 300, borderWidth: 3, padding: 12, flexDirection: "column" }}
    >
      <Button testId="drag-source" {...reorder.handlers(source)}>
        Source
      </Button>
    </div>
  )
}

beforeEach(() => {
  const document = createMockDocument()
  const extra = createTrack("audio", document.tracks, undefined, TEST_CREATION)
  extra.id = "boundary-target"
  document.tracks.splice(document.tracks.length - 1, 0, extra)
  for (const track of document.tracks) {
    track.collapsed = false
    track.heightPx = 70
  }
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
})
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test.each([
  { offset: -1, order: ["boundary-target", "3-audio", "4-midi"] },
  { offset: 1, order: ["3-audio", "boundary-target", "4-midi"] },
])("drag insertion follows the adjacent row boundary at $offset px", ({ offset, order }) => {
  const root = createTestRoot({ width: 400, height: 300 })
  roots.push(root)
  root.render(
    <ThemeProvider>
      <ReorderSurface />
    </ThemeProvider>
  )
  const container = root.renderer.findByTestId("reorder-container")
  const source = root.renderer.findByTestId("drag-source")
  if (!container || !source) throw new Error("Missing reorder surface")
  const containerBounds = root.renderer.getElementBounds(container.id)
  const sourceBounds = root.renderer.getElementBounds(source.id)
  const nextRow = projectedRows().find(row => row.track.id === "4-midi")
  if (!containerBounds || !sourceBounds || !nextRow) throw new Error("Missing row geometry")
  const x = sourceBounds.x + sourceBounds.width / 2
  const startY = sourceBounds.y + sourceBounds.height / 2
  const endY = containerBounds.y + nextRow.top + offset
  root.renderer.nativeSimulateMouseDown(x, startY)
  root.renderer.nativeSimulateMouseMove(x, endY, 0)
  root.renderer.nativeSimulateMouseUp(x, endY)
  expect<readonly string[]>(
    useProjectState
      .getState()
      .document.tracks.filter(track => projectedIds.has(track.id))
      .map(track => track.id)
  ).toEqual(order)
})
