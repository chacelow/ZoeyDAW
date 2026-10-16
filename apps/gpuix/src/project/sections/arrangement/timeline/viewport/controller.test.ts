import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { arrangementBodyBottom, layoutTrackRows, pinnedTrackHeight } from "../../core/layout"
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

const size = { containerWidth: 1104, bodyHeight: 320, timelineLeft: 304 }
function ownScene(scene: SceneStore, initialSize = size) {
  const owner = createTimelineController({
    sceneStore: scene,
    initialSize,
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

const control = { ctrl: true, cmd: false, alt: false, shift: false }

describe("Authoritative timeline viewport", () => {
  test("native frame ticks follow only after playback reaches the music viewport center", () => {
    projectActions.setViewport({ scrollX: 0, scrollY: 0 })
    projectActions.setFollow(true)
    const owner = ownScene(createSceneStore(DEFAULT_LAYOUT_TOKENS), {
      containerWidth: 704,
      bodyHeight: 300,
      timelineLeft: 0,
    })
    projectActions.togglePlay()
    projectActions.seekBar(2)
    owner.tick(0)
    expect(useProjectState.getState().workspace.scrollX).toBe(0)
    projectActions.seekBar(3.5)
    owner.tick(16)
    expect(useProjectState.getState().workspace.scrollX).toBe(50)
    projectActions.seekBar(3.75)
    owner.tick(32)
    expect(useProjectState.getState().workspace.scrollX).toBe(75)
    projectActions.seekBar(1.25)
    owner.tick(48)
    expect(useProjectState.getState().workspace.scrollX).toBe(0)
  })

  test("Follow disabled or stopped playback cannot move the viewport", () => {
    projectActions.setViewport({ scrollX: 0, scrollY: 0 })
    projectActions.setFollow(true)
    const owner = ownScene(createSceneStore(DEFAULT_LAYOUT_TOKENS), {
      containerWidth: 704,
      bodyHeight: 300,
      timelineLeft: 0,
    })
    projectActions.seekBar(5)
    owner.tick(0)
    expect(useProjectState.getState().workspace.scrollX).toBe(0)
    projectActions.setFollow(false)
    projectActions.togglePlay()
    owner.tick(16)
    expect(useProjectState.getState().workspace.scrollX).toBe(0)
    projectActions.setFollow(true)
    owner.tick(32)
    expect(useProjectState.getState().workspace.scrollX).toBe(200)
    projectActions.stop()
    projectActions.seekBar(8)
    owner.tick(48)
    expect(useProjectState.getState().workspace.scrollX).toBe(200)
  })

  test("explicit editor focus reveals its offscreen track without resetting musical scroll", () => {
    const owner = ownScene(createSceneStore(DEFAULT_LAYOUT_TOKENS), {
      containerWidth: 1104,
      bodyHeight: 200,
      timelineLeft: 0,
    })
    projectActions.setEditingClip("audio-1")
    const row = layoutTrackRows(owner.sceneStore.get()).find(item => item.track.id === "3-audio")
    if (!row) throw new Error("Audio track missing")
    expect(row.top).toBe(DEFAULT_LAYOUT_TOKENS.arrangement.barRulerHeight)
    expect(useProjectState.getState().workspace.scrollX).toBe(2000)
  })

  test("vertical wheel changes only tracks, horizontal or Shift wheel changes only musical scroll", () => {
    const viewport = createTimelineViewport(
      () => size,
      () => DEFAULT_LAYOUT_TOKENS
    )
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

  test("Ctrl wheel preserves the music point under the pointer", () => {
    const viewport = createTimelineViewport(
      () => size,
      () => DEFAULT_LAYOUT_TOKENS
    )
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
  })

  test("layout changes clamp logical scroll and no negative viewport survives zero-size windows", () => {
    const measured = { ...size }
    const viewport = createTimelineViewport(
      () => measured,
      () => DEFAULT_LAYOUT_TOKENS
    )
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
    const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
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
    const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
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
    const bottom =
      arrangementBodyBottom(320, DEFAULT_LAYOUT_TOKENS.arrangement) -
      pinnedTrackHeight(visibleTracks(project.tracks), DEFAULT_LAYOUT_TOKENS.track)
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

test("manual pan suspends follow only for the configured duration", () => {
  const clock = jest.spyOn(performance, "now").mockReturnValue(100)
  try {
    const viewport = createTimelineViewport(
      () => size,
      () => DEFAULT_LAYOUT_TOKENS,
      () => ({
        ...ARRANGEMENT_DEFAULTS,
        follow: { ...ARRANGEMENT_DEFAULTS.follow, manualPanPauseMs: 500 },
      })
    )
    projectActions.setFollow(true)
    projectActions.togglePlay()
    viewport.suspendFollow()
    clock.mockReturnValue(599)
    viewport.follow(40)
    expect(useProjectState.getState().workspace.scrollX).toBe(2000)
    clock.mockReturnValue(600)
    viewport.follow(40)
    expect(useProjectState.getState().workspace.scrollX).toBe(3500)
  } finally {
    clock.mockRestore()
  }
})
