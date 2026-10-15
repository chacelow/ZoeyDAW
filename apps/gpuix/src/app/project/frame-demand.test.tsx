import { afterEach, beforeEach, expect, test } from "bun:test"
import { useLayoutEffect, useSyncExternalStore } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider, createAnimationFrameSource } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { clipRect, layoutTrackRows } from "@/project/sections/arrangement/core/layout"
import { TRACK_TITLE_HEIGHT } from "@/project/layout"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AppInteractionProvider } from "../interaction"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { useProjectComposition } from "./useProjectComposition"
import { useProjectShell } from "./useProjectShell"
import type { AnimationFrameCallback } from "@/platform/frame"
import type { LanePointer } from "@/project/sections/arrangement/lane"
import type { ProjectComposition } from "./composition"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
beforeEach(() => {
  const document = createMockDocument()
  const source = document.tracks.find(track => track.kind === "midi")
  const main = document.tracks.find(track => track.kind === "main")
  if (!source || !main) throw new Error("Fixture lacks source/Main")
  source.id = "source"
  source.output = "main"
  source.clips = [{ id: "clip", kind: "midi", startBar: 2, lengthBars: 2, notes: [] }]
  document.tracks = [source, main]
  const workspace = createMockWorkspace()
  workspace.pxPerBar = 64
  workspace.scrollX = 0
  workspace.scrollY = 0
  workspace.grid = { mode: "fixed", bars: 0.25 }
  workspace.automationMode = false
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
})

function mount() {
  const native: {
    active: boolean
    callback: AnimationFrameCallback | null
    resumeCallback: AnimationFrameCallback | null
  } = {
    active: false,
    callback: null,
    resumeCallback: null,
  }
  const frames = createAnimationFrameSource({
    setAnimationFrameActive(active) {
      native.active = active
    },
    setAnimationFrameCallback(callback) {
      native.callback = callback
    },
    setResumeFrameCallback(callback) {
      native.resumeCallback = callback
    },
  })
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  cleanups.push(root.unmount)
  let owner: ProjectComposition | null = null
  function Harness() {
    const shell = useProjectShell()
    const { composition } = useProjectComposition(shell)
    useLayoutEffect(() => {
      owner = composition
    }, [composition])
    return composition ? <FollowProjection composition={composition} /> : <div />
  }
  root.render(
    <AnimationFrameProvider source={frames}>
      <ThemeProvider>
        <AppNativeEnvironmentProvider value={{ subscribeWindowActive: () => () => {} }}>
          <AppInteractionProvider>
            <WindowKeyboardProvider value={keyboard}>
              <Harness />
            </WindowKeyboardProvider>
          </AppInteractionProvider>
        </AppNativeEnvironmentProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
  return {
    root,
    native,
    owner() {
      if (!owner) throw new Error("Composition did not mount")
      return owner
    },
  }
}

function FollowProjection({ composition }: { readonly composition: ProjectComposition }) {
  const scene = useSyncExternalStore(
    composition.timeline.sceneStore.subscribe,
    composition.timeline.sceneStore.get
  )
  return <text testId="resume-follow-scroll">{scene.viewport.scrollX}</text>
}

function pointer(x: number, y: number): LanePointer {
  return { x, y, button: 0, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }
}

test("stopped idle has no native frame demand; playback starts it and stop releases it", () => {
  const { root, native } = mount()
  expect(native.active).toBe(false)
  expect(native.callback).toBeNull()
  expect(native.resumeCallback).toBeNull()
  flushSync(projectActions.togglePlay)
  expect(useProjectState.getState().session.playing).toBe(true)
  expect(native.active).toBe(true)
  expect(native.callback).not.toBeNull()
  expect(native.resumeCallback).not.toBeNull()
  flushSync(projectActions.stop)
  expect(native.active).toBe(false)
  expect(native.callback).toBeNull()
  expect(native.resumeCallback).toBeNull()
  root.unmount()
  expect(native.active).toBe(false)
})

test("real lane drag acquires frame demand after its threshold and releases it on commit", () => {
  const { native, owner } = mount()
  const composition = owner()
  flushSync(() =>
    composition.timeline.view.measure({ containerWidth: 1104, bodyHeight: 500, timelineLeft: 0 })
  )
  const scene = composition.timeline.sceneStore.get()
  const row = layoutTrackRows(scene).find(item => item.track.id === "source")
  const clip = row?.track.clips[0]
  if (!row || !clip) throw new Error("Missing lane drag fixture")
  const rect = clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
  const start = pointer(rect.left + rect.width / 2, row.top + TRACK_TITLE_HEIGHT / 2)
  const end = pointer(start.x + 48, start.y)
  flushSync(() => composition.lane.pointerDown(start))
  expect(native.active).toBe(false)
  flushSync(() => composition.lane.pointerMove(end, true))
  expect(useProjectState.getState().session.preview?.kind).toBe("tracks")
  expect(native.active).toBe(true)
  flushSync(() => composition.lane.pointerUp(end))
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2.75)
  expect(useProjectState.getState().session.preview).toBeNull()
  expect(native.active).toBe(false)
  expect(native.callback).toBeNull()
})

test("ruler autoscroll demand begins on start and ends on stop without pointer polling", () => {
  const { native, owner } = mount()
  const scroll = owner().timeline.view.autoScroll
  expect(native.active).toBe(false)
  flushSync(() => scroll.start({ ...pointer(799, 40), windowX: 799, windowY: 40 }, "horizontal"))
  expect(native.active).toBe(true)
  flushSync(scroll.stop)
  expect(native.active).toBe(false)
  expect(native.callback).toBeNull()
})

test("resume commits the latest real timeline follow position before the first present", () => {
  const { root, native, owner } = mount()
  flushSync(() => {
    owner().timeline.view.measure({ containerWidth: 704, bodyHeight: 300, timelineLeft: 0 })
    projectActions.setViewport({ pxPerBar: 100, scrollX: 0, scrollY: 0 })
    projectActions.setFollow(true)
    projectActions.togglePlay()
    projectActions.seekBar(5)
  })
  expect(root.renderer.getAllText()).toEqual(["0"])
  native.resumeCallback?.(16)
  expect(root.renderer.getAllText()).toEqual(["200"])
  root.renderer.flush()
  expect(root.renderer.getPaintedText()).toEqual(["200"])
  flushSync(projectActions.stop)
  expect(native.resumeCallback).toBeNull()
})
