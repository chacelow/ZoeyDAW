import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { hydrateProject, projectActions, useProjectState } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { visibleTracks } from "@zoeydaw/project-core/types"
import { createSceneStore } from "../scene"
import { arrangementBodyBottom, pinnedTrackHeight } from "../layout"
import { createAutoScroll } from "./autoScroll"
import type { CanvasPointer } from "./types"

afterEach(() => vi.unstubAllGlobals())

it("stops vertical autoscroll at the top of an expanded pinned automation lane", () => {
  const project = createMockDocument(DEFAULT_TRACK_HEIGHT)
  hydrateProject(
    JSON.stringify({ version: 3, document: project, workspace: createMockWorkspace() })
  )
  const tracks = visibleTracks(project.tracks)
  const scene = createSceneStore()
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 1 },
    transport: project.transport,
    media: project.media,
    patterns: project.patterns,
    markers: project.markers,
    loop: project.transport.loop,
    tracks: project.tracks,
  })
  scene.setViewport({ pxPerBar: 24, scrollX: 0, scrollY: 0, width: 1000, height: 320, dpr: 1 })
  const lanes = { main: [{ kind: "mixer", parameter: "pan" } as const] }
  scene.setAutomationDisplay({}, lanes, true)
  const callbacks: FrameRequestCallback[] = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
  const element = document.createElement("div")
  const boundary = arrangementBodyBottom(320) - pinnedTrackHeight(tracks, { mode: true, lanes })
  const pointer: CanvasPointer = {
    x: 500,
    y: boundary + 1,
    clientX: 500,
    clientY: boundary + 1,
    pointerId: 1,
    button: 0,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
  }
  const scroll = createAutoScroll(
    { element, scene, actions: projectActions, getState: useProjectState.getState },
    () => {}
  )
  scroll.start(element, pointer, "both")
  callbacks.shift()?.(16)
  callbacks.shift()?.(32)
  expect(scene.get().viewport.scrollY).toBe(0)
  scroll.stop()
})
