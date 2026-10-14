import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../core/scene"
import { Grid } from "./grid"
import { MiniMap } from "./minimap"
import { Rulers, TimeRuler } from "./rulers"
import { createTimelineController } from "./controller"
import { englishLabels } from "./demo-labels"
import { flushSync } from "@gpuix/react"

const disposals: Array<() => void> = []
afterEach(() => {
  while (disposals.length) disposals.pop()?.()
})

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
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
    disposals.push(root.unmount)
    let hidden = false
    let restored = false
    const cursor = {
      capture: () => ({ x: 440, y: 20 }),
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
  })

  test("folded descendants keep their overview clips and vertical track scroll cannot move the minimap", () => {
    const root = createTestRoot({ width: 1280, height: 100 })
    disposals.push(root.unmount)
    root.render(
      <ThemeProvider>
        <MiniMap
          width={1280}
          height={40}
          label="Arrangement overview"
          cursor={{ capture: () => null, hide: () => {}, restore: () => {} }}
          onNavigate={() => {}}
          onViewport={projectActions.setViewport}
          geometry={{
            bars: 128,
            viewportWidth: 800,
            pxPerBar: 100,
            scrollX: 4000,
            minPxPerBar: 6.25,
            maxPxPerBar: 131072,
          }}
        />
      </ThemeProvider>
    )
    const overview = root.renderer.findByTestId("timeline-minimap")
    const clip = root.renderer.findByTestId("minimap-clip-trager-1")
    if (!overview || !clip) throw new Error("Overview source clip missing")
    const frameBefore = root.renderer.getElementBounds(overview.id)
    const clipBefore = root.renderer.getElementBounds(clip.id)
    expect(clipBefore).toMatchObject({ width: 80, height: 7, y: 8 })
    flushSync(() => {
      projectActions.updateTrack("drums-group", { collapsed: true })
      projectActions.setViewport({ scrollY: 120 })
    })
    root.renderer.flush()
    const retained = root.renderer.findByTestId("minimap-clip-trager-1")
    if (!retained) throw new Error("Fold hid overview content")
    expect(root.renderer.getElementBounds(retained.id)).toEqual(clipBefore)
    expect(root.renderer.getElementBounds(overview.id)).toEqual(frameBefore)
  })

  test("numbered Pattern regions stay whole bars when fine labels are visible", () => {
    const scene = makeScene()
    scene.setViewport({ ...scene.get().viewport, pxPerBar: 800, width: 1200, scrollX: 400 })
    const root = createTestRoot({ width: 1200, height: 300 })
    disposals.push(root.unmount)
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
  })

  test("marker drag commits once and native Arrow input is consumed by only the ruler owner", () => {
    const scene = makeScene()
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Marker not created")
    projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
    const owner = createTimelineController({
      sceneStore: scene,
      initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
      metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
      keyboard: { focus: () => "timeline", blurControl: () => {} },
      subscribeWindowActive: () => () => {},
    })
    disposals.push(owner.dispose)
    const root = createTestRoot({
      width: 800,
      height: 100,
      onKeyDown: owner.keyboard.down,
      onKeyUp: owner.keyboard.up,
    })
    disposals.push(root.unmount)
    root.render(
      <ThemeProvider>
        <Rulers owner={owner} labels={englishLabels} />
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
    const before = useProjectState.getState().session.position
    const ruler = root.renderer.findByTestId("timeline-rulers")
    if (!ruler) throw new Error("Ruler missing")
    root.renderer.nativeSimulateKeystrokes(ruler.id, "right")
    expect(useProjectState.getState().document.markers.find(marker => marker.id === id)?.bar).toBe(
      4.5
    )
    expect(useProjectState.getState().session.position).toEqual(before)
  })

  test("real-time ruler rescales with BPM while retaining the music scroll origin", () => {
    const scene = makeScene()
    scene.setMusic({ ...scene.get(), transport: { bpm: 120, numerator: 4, denominator: 4 } })
    scene.setViewport({ ...scene.get().viewport, scrollX: 200 })
    const root = createTestRoot({ width: 800, height: 100 })
    disposals.push(root.unmount)
    root.render(
      <ThemeProvider>
        <TimeRuler scene={scene} label="Time ruler" />
      </ThemeProvider>
    )
    function tenSecondsLeft() {
      const label = root.renderer.findByText("0:10")
      if (label?.parentId == null) throw new Error("Time label missing")
      const bounds = root.renderer.getElementBounds(label.parentId)
      if (!bounds) throw new Error("Time label not painted")
      return bounds.x
    }
    const before = tenSecondsLeft()
    flushSync(() =>
      scene.setMusic({ ...scene.get(), transport: { bpm: 60, numerator: 4, denominator: 4 } })
    )
    root.renderer.flush()
    expect(before - tenSecondsLeft()).toBe(250)
    expect(scene.get().viewport.scrollX).toBe(200)
  })
})
