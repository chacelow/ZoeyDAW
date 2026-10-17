import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { MiniMap } from "."
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import type { CursorLockPort } from "@/ui/controls"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test("overview pressed color survives leaving its bounds and cancellation restores hover", () => {
  projectActions.setViewport({ pxPerBar: 100, scrollX: 4000 })
  const root = createTestRoot({ width: 800, height: 120 })
  roots.push(root)
  let normal = ""
  let hover = ""
  let pressed = ""
  let hidden = false
  const cursor: CursorLockPort = {
    begin: () => {
      hidden = true
    },
    end: () => {
      hidden = false
    },
  }
  function Fixture() {
    const theme = useTheme()
    const workspace = useProjectState(state => state.workspace)
    normal = theme.colors.canvasScrollbar
    hover = theme.colors.canvasScrollbarHover
    pressed = theme.colors.canvasScrollbarActive
    return (
      <MiniMap
        width={800}
        height={32}
        label="Overview"
        geometry={{
          policy: ARRANGEMENT_DEFAULTS,
          bars: 128,
          viewportWidth: 800,
          pxPerBar: workspace.pxPerBar,
          scrollX: workspace.scrollX,
          minPxPerBar: 6.25,
          maxPxPerBar: 131072,
        }}
        cursor={cursor}
        onNavigate={() => {}}
        onViewport={projectActions.setViewport}
        onFit={() => {}}
      />
    )
  }
  root.render(
    <ThemeProvider>
      <Fixture />
    </ThemeProvider>
  )
  const color = () => root.renderer.findByTestId("minimap-frame")?.style.backgroundColor
  expect(color()).toBe(normal)
  root.renderer.nativeSimulateMouseMove(275, 16, 0)
  expect(color()).toBe(hover)
  root.renderer.nativeSimulateMouseDown(275, 16)
  expect(color()).toBe(pressed)
  root.renderer.nativeSimulateMouseMove(275, 70, 0)
  expect(hidden).toBe(true)
  expect(color()).toBe(pressed)
  root.renderer.nativeSimulateMouseUp(275, 70)
  expect(hidden).toBe(false)
  expect(color()).toBe(normal)
  root.renderer.nativeSimulateMouseMove(275, 16, 0)
  root.renderer.nativeSimulateMouseDown(275, 16)
  root.renderer.nativeSimulateMouseMove(275, 24, 0)
  expect(hidden).toBe(true)
  const { document, workspace } = useProjectState.getState()
  flushSync(() => hydrateProject(JSON.stringify({ version: 2, document, workspace })))
  expect(hidden).toBe(false)
  expect(color()).toBe(hover)
  const directory = mkdtempSync(path.join(tmpdir(), "timeline-epoch-present-"))
  try {
    root.renderer.captureScreenshot(path.join(directory, "first.png"))
    root.render(
      <ThemeProvider>
        <Fixture />
      </ThemeProvider>
    )
    root.renderer.captureScreenshot(path.join(directory, "settled.png"))
    expect(readFileSync(path.join(directory, "first.png"))).toEqual(
      readFileSync(path.join(directory, "settled.png"))
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
