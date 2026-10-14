import { beforeEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../../shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../adapters/fixtures"
import { initialSession, useProjectState as projectStore } from "../../../stores/useProjectState"
import { createSceneStore } from "../core/scene"
import { Grid } from "./grid"
import { MiniMap } from "./minimap"
import { Rulers, TimeRuler } from "./rulers"

beforeEach(() => {
  projectStore.setState({
    document: createMockDocument(),
    workspace: createMockWorkspace(),
    session: initialSession(),
  })
})

function makeScene() {
  const scene = createSceneStore()
  const { document: project, workspace } = useProjectState.getState()
  scene.setMusic({
    bars: 128,
    grid: workspace.grid,
    transport: project.transport,
    markers: project.markers,
    tracks: project.tracks,
    loop: project.transport.loop,
  })
  scene.setViewport({ width: 800, height: 320, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
  return scene
}

describe("Native timeline layout and hit testing", () => {
  test("Minimap survives a jitter and continues hidden-cursor dragging through store renders", () => {
    projectActions.setViewport({ pxPerBar: 100, scrollX: 4000 })
    const root = createTestRoot({ width: 1280, height: 100 })
    let hidden = false
    let restored = false
    const cursor = {
      position: () => ({ x: 440, y: 20 }),
      hide: () => {
        hidden = true
        return true
      },
      restore: () => {
        hidden = false
        restored = true
        return true
      },
    }
    function Harness() {
      const workspace = useProjectState(state => state.workspace)
      return (
        <ThemeProvider>
          <MiniMap
            width={1280}
            height={40}
            label="Arrangement overview"
            cursor={cursor}
            onNavigate={() => {}}
            onViewport={projectActions.setViewport}
            geometry={{
              bars: 128,
              viewportWidth: 800,
              pxPerBar: workspace.pxPerBar,
              scrollX: workspace.scrollX,
              minPxPerBar: 6.25,
              maxPxPerBar: 131072,
            }}
          />
        </ThemeProvider>
      )
    }
    root.render(<Harness />)
    root.renderer.flush()
    root.renderer.nativeSimulateMouseDown(440, 20)
    root.renderer.nativeSimulateMouseMove(441, 21, 0)
    root.renderer.flush()
    expect(root.renderer.findByTestId("timeline-minimap")).not.toBeNull()
    expect(useProjectState.getState().workspace.pxPerBar).toBe(100)
    root.renderer.nativeSimulateMouseMove(440, 60, 0)
    root.renderer.flush()
    expect(hidden).toBe(true)
    expect(useProjectState.getState().workspace.pxPerBar).toBeLessThan(100)
    const afterFirst = useProjectState.getState().workspace.pxPerBar
    root.renderer.nativeSimulateMouseMove(440, 80, 0)
    root.renderer.flush()
    expect(useProjectState.getState().workspace.pxPerBar).toBeLessThan(afterFirst)
    root.renderer.nativeSimulateMouseUp(440, 80)
    expect(hidden).toBe(false)
    expect(restored).toBe(true)
    root.unmount()
  })

  test("numbered Pattern regions stay whole bars when fine labels are visible", () => {
    const scene = makeScene()
    scene.setViewport({ ...scene.get().viewport, pxPerBar: 800, width: 1200, scrollX: 400 })
    const root = createTestRoot({ width: 1200, height: 300 })
    root.render(
      <ThemeProvider>
        <Grid scene={scene} height={200} />
      </ThemeProvider>
    )
    root.renderer.flush()
    const first = root.renderer.findByTestId("pattern-region-1")
    const second = root.renderer.findByTestId("pattern-region-2")
    if (!first || !second) throw new Error("Pattern regions missing")
    expect(root.renderer.getElementBounds(first.id)).toMatchObject({
      x: 0,
      width: 400,
      height: 200,
    })
    expect(root.renderer.getElementBounds(second.id)).toMatchObject({
      x: 400,
      width: 800,
      height: 200,
    })
    expect(root.renderer.findByTestId("pattern-region-1.25")).toBeUndefined()
    root.unmount()
  })

  test("marker drag previews then commits without opening an editor and Escape restores seek", () => {
    const scene = makeScene()
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Marker not created")
    const state = useProjectState.getState()
    scene.setMusic({ ...scene.get(), markers: state.document.markers })
    const root = createTestRoot({ width: 800, height: 100 })
    root.render(
      <ThemeProvider>
        <Rulers scene={scene} label="Music ruler" />
      </ThemeProvider>
    )
    root.renderer.flush()
    root.renderer.nativeSimulateMouseDown(200, 8)
    root.renderer.nativeSimulateMouseMove(300, 8, 0)
    expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
      3
    )
    expect(useProjectState.getState().session.preview?.kind).toBe("markers")
    root.renderer.nativeSimulateMouseUp(300, 8)
    expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
      4
    )
    expect(useProjectState.getState().session.editingClipId).toBeNull()
    root.unmount()
  })

  test("real-time ruler rescales with BPM while sharing the exact music scroll axis", () => {
    const scene = makeScene()
    const root = createTestRoot({ width: 800, height: 100 })
    root.render(
      <ThemeProvider>
        <TimeRuler scene={scene} label="Time ruler" />
      </ThemeProvider>
    )
    root.renderer.flush()
    expect(root.renderer.getAllText()).toContain("0:02")
    scene.setMusic({ ...scene.get(), transport: { bpm: 60, numerator: 4, denominator: 4 } })
    root.renderer.flush()
    expect(root.renderer.getAllText()).toContain("0:04")
    root.unmount()
  })
})
