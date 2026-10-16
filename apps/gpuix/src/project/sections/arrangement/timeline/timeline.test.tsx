import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { createRendererState } from "@gpuix/native/host"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../core/scene"
import { MiniMap } from "./minimap"
import { Rulers, TimeRuler } from "./rulers"
import { createTimelineController } from "./controller"
import { englishLabels } from "./demo-labels"
import { flushSync } from "@gpuix/react"
import { Button } from "@/ui/controls"
import type { CursorLockPort } from "@/ui/controls"

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
  const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
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

function timelineOwner(scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)) {
  const owner = createTimelineController({
    sceneStore: scene,
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  disposals.push(owner.dispose)
  return owner
}

describe("Native timeline layout and hit testing", () => {
  for (const coordinates of [{}, { x: 450 }, { y: 20 }]) {
    test(`Minimap ignores an incomplete press ${JSON.stringify(coordinates)}`, () => {
      projectActions.setViewport({ pxPerBar: 100, scrollX: 4000 })
      const owner = timelineOwner()
      const root = createTestRoot({ width: 1280, height: 100 })
      disposals.push(root.unmount)
      let captures = 0
      let hidden = false
      const cursor: CursorLockPort = {
        capture: point => {
          captures++
          return point
        },
        hide: () => {
          hidden = true
        },
        restore: () => {
          hidden = false
        },
      }
      root.render(
        <ThemeProvider>
          <MiniMap
            width={1280}
            height={40}
            label="Arrangement overview"
            geometry={owner.view.overviewGeometry()}
            cursor={cursor}
            onNavigate={owner.view.suspendFollow}
            onViewport={projectActions.setViewport}
            onFit={owner.fitToProject}
          />
        </ThemeProvider>
      )
      root.renderer.flush()
      const overview = root.renderer.findByTestId("timeline-minimap")
      if (!overview) throw new Error("Overview missing")
      expect(
        createRendererState(root.renderer).dispatch({
          elementId: overview.id,
          eventType: "mouseDown",
          ...coordinates,
        })
      ).toBe(true)
      root.renderer.nativeSimulateMouseMove(450, 30, 0)
      expect(captures).toBe(0)
      expect(hidden).toBe(false)
      expect(useProjectState.getState().workspace).toMatchObject({ pxPerBar: 100, scrollX: 4000 })
    })
  }

  test("Minimap survives a jitter and continues hidden-cursor dragging through store renders", () => {
    projectActions.setViewport({ pxPerBar: 100, scrollX: 4000 })
    const owner = timelineOwner()
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
            onFit={owner.fitToProject}
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
    const normalColor = root.renderer.findByTestId("minimap-frame")?.style.backgroundColor
    root.renderer.nativeSimulateMouseDown(440, 20)
    const pressedColor = root.renderer.findByTestId("minimap-frame")?.style.backgroundColor
    expect(pressedColor).not.toBe(normalColor)
    root.renderer.nativeSimulateMouseMove(441, 21, 0)
    root.renderer.flush()
    expect(root.renderer.findByTestId("timeline-minimap")).not.toBeNull()
    expect(useProjectState.getState().workspace.pxPerBar).toBe(100)
    root.renderer.nativeSimulateMouseMove(440, 60, 0)
    root.renderer.flush()
    expect(root.renderer.findByTestId("minimap-frame")?.style.backgroundColor).toBe(pressedColor)
    expect(hidden).toBe(true)
    expect(useProjectState.getState().workspace.pxPerBar).toBeLessThan(100)
    const afterFirst = useProjectState.getState().workspace.pxPerBar
    root.renderer.nativeSimulateMouseMove(440, 80, 0)
    root.renderer.flush()
    expect(root.renderer.findByTestId("minimap-frame")?.style.backgroundColor).toBe(pressedColor)
    expect(useProjectState.getState().workspace.pxPerBar).toBeLessThan(afterFirst)
    root.renderer.nativeSimulateMouseUp(440, 80)
    expect(hidden).toBe(false)
    expect(restored).toBe(true)
    expect(root.renderer.findByTestId("minimap-frame")?.style.backgroundColor).toBe(normalColor)
    const overview = root.renderer.findByTestId("timeline-minimap")
    if (!overview) throw new Error("Overview missing")
    root.renderer.nativeSimulateKeystrokes(overview.id, "enter")
    expect(useProjectState.getState().workspace.pxPerBar).toBe(6.25)
    expect(useProjectState.getState().workspace.scrollX).toBe(0)
  })

  test("folded descendants keep their overview clips and vertical track scroll cannot move the minimap", () => {
    const owner = timelineOwner()
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
          onFit={owner.fitToProject}
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

  test("marker drag commits once and native Arrow input is consumed by only the ruler owner", () => {
    const scene = makeScene()
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Marker not created")
    projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
    const owner = timelineOwner(scene)
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

  test("Enter on a focused native control cannot also rename a selected locator", () => {
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Locator missing")
    projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
    const owner = createTimelineController({
      sceneStore: createSceneStore(DEFAULT_LAYOUT_TOKENS),
      initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
      metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
      keyboard: { focus: () => "control", blurControl: () => {} },
      subscribeWindowActive: () => () => {},
    })
    disposals.push(owner.dispose)
    owner.view.rulers.down(200, 8)
    owner.view.rulers.up()
    const root = createTestRoot({ width: 300, height: 100, onKeyDown: owner.keyboard.down })
    disposals.push(root.unmount)
    function Harness() {
      const snap = useProjectState(state => state.workspace.snap)
      return (
        <ThemeProvider>
          <Button
            testId="snap-control"
            label="Snap"
            active={snap}
            onActiveChange={projectActions.setSnap}
          >
            Snap
          </Button>
        </ThemeProvider>
      )
    }
    root.render(<Harness />)
    const before = useProjectState.getState().workspace.snap
    const button = root.renderer.findByTestId("snap-control")
    if (!button) throw new Error("Snap control missing")
    root.renderer.nativeSimulateKeystrokes(button.id, "enter")
    expect(useProjectState.getState().workspace.snap).toBe(!before)
    expect(owner.sceneStore.get().targetSelection).toEqual({
      kind: "marker",
      id,
      phase: "selected",
    })
  })

  test("native locator rename selects all, commits Enter once and cancels Escape", () => {
    const id = projectActions.addMarker(3)
    if (!id) throw new Error("Locator missing")
    projectActions.updateMarker(id, { label: "Original locator" })
    projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
    const owner = timelineOwner()
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
    root.renderer.nativeSimulateClick(200, 8)
    const ruler = root.renderer.findByTestId("timeline-rulers")
    if (!ruler) throw new Error("Ruler missing")
    root.renderer.nativeSimulateKeystrokes(ruler.id, "f2")
    const editor = root.renderer.findByTestId("marker-name-editor")
    if (!editor) throw new Error("Locator editor missing")
    root.renderer.nativeSimulateKeystrokes(editor.id, "q")
    expect(root.renderer.findByTestId("marker-name-editor")?.customProps?.value).toBe("q")
    expect(
      useProjectState.getState().document.markers.find(marker => marker.id === id)?.label
    ).toBe("Original locator")
    root.renderer.nativeSimulateKeystrokes(editor.id, "enter")
    expect(
      useProjectState.getState().document.markers.find(marker => marker.id === id)?.label
    ).toBe("q")
    expect(root.renderer.findByTestId("marker-name-editor")).toBeUndefined()
    expect(owner.sceneStore.get().targetSelection).toEqual({
      kind: "marker",
      id,
      phase: "selected",
    })
    root.renderer.nativeSimulateKeystrokes(ruler.id, "f2")
    const next = root.renderer.findByTestId("marker-name-editor")
    if (!next) throw new Error("Locator editor did not reopen")
    root.renderer.nativeSimulateKeystrokes(next.id, "z escape")
    expect(
      useProjectState.getState().document.markers.find(marker => marker.id === id)?.label
    ).toBe("q")
    expect(root.renderer.findByTestId("marker-name-editor")).toBeUndefined()
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
