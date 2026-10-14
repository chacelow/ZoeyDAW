import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { arrangementBodyBottom, pinnedTrackHeight } from "../../core/layout"
import { visibleTracks } from "@/project/model/types"
import { createTimelineViewport } from "./controller"
import { createTimelineController } from "../controller"
import { timelinePointer } from "./coordinates"
import type { TimelineController } from "../controller"
import type { SceneStore } from "../../core/scene"

const owners: TimelineController[] = []
afterEach(() => {
  for (const owner of owners) owner.dispose()
  owners.length = 0
})

function ownScene(scene: SceneStore) {
  const owner = createTimelineController({
    sceneStore: scene,
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 304 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  owners.push(owner)
  return owner
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  projectActions.setViewport({ pxPerBar: 100, scrollX: 2000, scrollY: 30 })
})

const size = { containerWidth: 1104, bodyHeight: 320, timelineLeft: 304 }
const control = { ctrl: true, cmd: false, alt: false, shift: false }

describe("Authoritative timeline viewport", () => {
  test("vertical wheel changes only tracks, horizontal or Shift wheel changes only musical scroll", () => {
    const viewport = createTimelineViewport(() => size)
    viewport.wheel({ elementId: 0, eventType: "scroll", deltaY: -20 })
    expect(useProjectState.getState().workspace.scrollX).toBe(2000)
    expect(useProjectState.getState().workspace.scrollY).toBe(50)
    viewport.wheel({ elementId: 0, eventType: "scroll", deltaX: -20 })
    expect(useProjectState.getState().workspace.scrollX).toBe(2020)
    expect(useProjectState.getState().workspace.scrollY).toBe(50)
    viewport.wheel({
      elementId: 0,
      eventType: "scroll",
      deltaY: -30,
      modifiers: { ...control, ctrl: false, shift: true },
    })
    expect(useProjectState.getState().workspace.scrollX).toBe(2050)
    expect(useProjectState.getState().workspace.scrollY).toBe(50)
  })

  test("Ctrl wheel preserves the music point under the pointer and consumed numeric wheel cannot move canvas", () => {
    const viewport = createTimelineViewport(() => size)
    const anchor = (2000 + 240) / 100
    viewport.wheel({
      elementId: 0,
      eventType: "scroll",
      x: size.timelineLeft + 240,
      deltaY: 100,
      modifiers: control,
    })
    const after = useProjectState.getState().workspace
    expect((after.scrollX + 240) / after.pxPerBar).toBeCloseTo(anchor)
    expect(after.scrollY).toBe(30)
    expect(viewport.wheel({ elementId: 0, eventType: "scroll", deltaY: 100 }, true)).toBe(false)
    expect(useProjectState.getState().workspace).toBe(after)
  })

  test("layout changes clamp logical scroll and no negative viewport survives zero-size windows", () => {
    const measured = { ...size }
    const viewport = createTimelineViewport(() => measured)
    projectActions.setViewport({ pxPerBar: 1e10, scrollX: 1e20, scrollY: 1e20 })
    viewport.clamp()
    const clamped = viewport.read()
    expect(useProjectState.getState().workspace.pxPerBar).toBe(clamped.maxPxPerBar)
    expect(clamped.scrollX).toBe(clamped.timelineWidth - clamped.timeViewportWidth)
    expect(clamped.scrollY).toBeLessThan(1e20)
    measured.containerWidth = 0
    measured.bodyHeight = 0
    viewport.clamp()
    expect(viewport.read().timeViewportWidth).toBe(0)
    expect(viewport.read().scrollX).toBeGreaterThanOrEqual(0)
    expect(viewport.read().scrollY).toBeGreaterThanOrEqual(0)
  })

  test("frame ticks keep scrolling a stationary edge pointer, horizontal mode never scrolls tracks, and stop releases ownership", () => {
    const scene = createSceneStore()
    const project = useProjectState.getState().document
    scene.setMusic({ ...scene.get(), tracks: project.tracks, transport: project.transport })
    scene.setViewport({
      pxPerBar: 100,
      scrollX: 2000,
      scrollY: 30,
      width: 800,
      height: 320,
      dpr: 1,
    })
    const scroll = ownScene(scene).view.autoScroll
    const pointer = timelinePointer(
      { elementId: 0, eventType: "mouseMove", x: 799, y: 40 },
      { x: 0, y: 0 }
    )
    scroll.start(pointer, "horizontal")
    scroll.tick(0)
    scroll.tick(16)
    const first = useProjectState.getState().workspace.scrollX
    scroll.tick(32)
    expect(useProjectState.getState().workspace.scrollX).toBeGreaterThan(first)
    expect(useProjectState.getState().workspace.scrollY).toBe(30)
    const stopped = useProjectState.getState().workspace
    scroll.stop()
    scroll.tick(1000)
    expect(useProjectState.getState().workspace).toBe(stopped)
  })

  test("pinned Return/Main region never causes vertical autoscroll", () => {
    const scene = createSceneStore()
    const project = useProjectState.getState().document
    scene.setMusic({ ...scene.get(), tracks: project.tracks, transport: project.transport })
    scene.setViewport({
      pxPerBar: 100,
      scrollX: 2000,
      scrollY: 30,
      width: 800,
      height: 320,
      dpr: 1,
    })
    const bottom = arrangementBodyBottom(320) - pinnedTrackHeight(visibleTracks(project.tracks))
    const scroll = ownScene(scene).view.autoScroll
    scroll.start(
      timelinePointer(
        { elementId: 0, eventType: "mouseMove", x: 400, y: bottom + 5 },
        { x: 0, y: 0 }
      ),
      "both"
    )
    scroll.tick(0)
    scroll.tick(16)
    expect(useProjectState.getState().workspace.scrollY).toBe(30)
    scroll.stop()
  })
})
