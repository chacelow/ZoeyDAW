import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useLayoutEffect, useSyncExternalStore } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { configurePreferences, createPreferenceOwner, setPreference } from "@/platform/settings"
import {
  configureProjectBackend,
  getEffectiveDocument,
  hydrateProject,
  projectActions,
  serializeProject,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createVerificationProjectBackend } from "@/project/adapters/verification/environment-backend"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { useProjectState as projectStore } from "@/project/stores/useProjectState"
import { createManualFrames } from "@/project/sections/arrangement/lane/testing/frames.test-helper"
import { clipRect, layoutTrackRows } from "@/project/sections/arrangement/core/layout"
import { rulerHit } from "@/project/sections/arrangement/core/rulers/geometry"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AppInteractionProvider } from "../interaction"
import { AppNativeEnvironmentProvider } from "../native-environment"
import { useProjectComposition } from "./useProjectComposition"
import { useProjectShell } from "./useProjectShell"
import type { TestRoot } from "@gpuix/react/testing"
import type { PreferenceOwner } from "@/platform/settings"
import type { WorkspaceState } from "@/project/model/types"
import type { CanvasTargetSelection } from "@/project/sections/arrangement/core/scene"
import type { LanePointer } from "@/project/sections/arrangement/lane"
import type { ProjectComposition } from "./composition"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import type { ThemeProviderProps } from "@/shared/theme/ThemeProvider"

const cleanups: (() => void)[] = []
afterEach(() => {
  const errors: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      cleanup()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      `Live policy fixture cleanup failed:\n${errors.map(error => (error instanceof Error ? error.stack : String(error))).join("\n")}`
    )
})

interface LivePolicyFixture {
  readonly root: TestRoot
  readonly owner: () => ProjectComposition
  readonly owners: ReadonlySet<ProjectComposition>
  readonly preferences: PreferenceOwner
  readonly configDir: string
  readonly setMetrics: (project: NonNullable<ThemeProviderProps["project"]>) => void
}

function mount(): LivePolicyFixture {
  const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-live-policy-"))
  cleanups.push(() => rmSync(configDir, { recursive: true, force: true }))
  const preferences = createPreferenceOwner({ configDir })
  preferences.setPreference("arrangement", { zoom: { stepInFactor: 1.5, stepAnchorRatio: 0 } })
  preferences.setPreference("pointer", {
    ...preferences.getPreference("pointer"),
    dragThresholdPixels: 80,
  })
  cleanups.push(configurePreferences(preferences))

  const savedState = useProjectState.getState()
  const document = createMockDocument()
  const source = document.tracks.find(track => track.kind === "midi")
  const main = document.tracks.find(track => track.kind === "main")
  if (!source || !main) throw new Error("Missing live policy source/Main fixture")
  source.id = "source"
  source.output = "main"
  source.clips = [{ id: "clip", kind: "midi", startBar: 2, lengthBars: 2, notes: [] }]
  document.tracks = [source, main]
  document.markers = [{ id: "marker", bar: 6, label: "Policy marker" }]
  const workspace = {
    ...createMockWorkspace(),
    pxPerBar: 64,
    scrollX: 0,
    scrollY: 0,
    grid: { mode: "fixed", bars: 0.25 },
    snap: true,
    follow: false,
    drawMode: false,
    automationMode: false,
  } satisfies WorkspaceState
  const fixtureSnapshot = JSON.stringify({ version: 2, document, workspace })
  cleanups.push(() => {
    try {
      hydrateProject(fixtureSnapshot)
    } finally {
      projectStore.setState(savedState, true)
    }
  })
  cleanups.push(configureProjectBackend(createVerificationProjectBackend))
  hydrateProject(fixtureSnapshot)
  cleanups.push(startProjectRuntime())

  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  cleanups.push(() => root.unmount())
  const frames = createManualFrames()
  let current: ProjectComposition | null = null
  const owners = new Set<ProjectComposition>()
  let projectMetrics: ThemeProviderProps["project"]
  const nativeEnvironment = { subscribeWindowActive: () => () => {} }
  function Harness() {
    const shell = useProjectShell()
    const { composition } = useProjectComposition(shell)
    useLayoutEffect(() => {
      current = composition
      if (composition) owners.add(composition)
    }, [composition])
    return composition ? <SceneProjection composition={composition} /> : <div />
  }
  function render() {
    root.render(
      <AnimationFrameProvider source={frames}>
        <ThemeProvider project={projectMetrics}>
          <AppNativeEnvironmentProvider value={nativeEnvironment}>
            <AppInteractionProvider>
              <WindowKeyboardProvider value={keyboard}>
                <Harness />
              </WindowKeyboardProvider>
            </AppInteractionProvider>
          </AppNativeEnvironmentProvider>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
  }
  render()
  function owner(): ProjectComposition {
    if (!current) throw new Error("Actual useProjectComposition hook did not mount")
    return current
  }
  act(root, () =>
    owner().timeline.view.measure({ containerWidth: 1104, bodyHeight: 500, timelineLeft: 0 })
  )
  return {
    root,
    owner,
    owners,
    preferences,
    configDir,
    setMetrics(project) {
      projectMetrics = project
      render()
    },
  }
}

function SceneProjection({ composition }: { readonly composition: ProjectComposition }) {
  const scene = useSyncExternalStore(
    composition.timeline.sceneStore.subscribe,
    composition.timeline.sceneStore.get
  )
  return (
    <text testId="live-policy-scene">
      {JSON.stringify({
        viewport: scene.viewport,
        timeSelection: scene.timeSelection,
        targetSelection: scene.targetSelection,
        clipDrag: scene.clipDrag !== null,
        preview: useProjectState.getState().session.preview?.kind ?? null,
      })}
    </text>
  )
}

function act(root: TestRoot, action: () => void) {
  flushSync(action)
  root.renderer.flush()
}

async function settle(root: TestRoot) {
  expect(await whenProjectBackendIdle()).toBe(true)
  act(root, () => {})
  expect(useProjectState.getState().session.backend.phase).toBe("ready")
}

function pointer(x: number, y: number): LanePointer {
  return { x, y, button: 0, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }
}

function clipPointer(composition: ProjectComposition) {
  const scene = composition.timeline.sceneStore.get()
  const row = layoutTrackRows(scene).find(item => item.track.id === "source")
  const clip = row?.track.clips.find(item => item.id === "clip")
  if (!row || !clip) throw new Error("Missing live policy lane clip")
  const rect = clipRect(clip, row, scene.viewport.pxPerBar, scene.viewport.scrollX)
  return pointer(rect.left + rect.width / 2, row.top + scene.geometry.track.titleHeight / 2)
}

function expectSameOwners(fixture: LivePolicyFixture, initial: ProjectComposition) {
  expect(fixture.owner()).toBe(initial)
  expect(fixture.owners.size).toBe(1)
  expect(fixture.owner().timeline).toBe(initial.timeline)
  expect(fixture.owner().timeline.sceneStore).toBe(initial.timeline.sceneStore)
  expect(fixture.owner().timeline.view).toBe(initial.timeline.view)
  expect(fixture.owner().lane).toBe(initial.lane)
}

test("live arrangement/pointer preferences retain composition, selection and viewport while changing real zoom/drag behavior", async () => {
  const fixture = mount()
  const { root, preferences } = fixture
  await settle(root)
  const initial = fixture.owner()
  const scene = initial.timeline.sceneStore
  const selection = { startBar: 2, endBar: 4, trackIds: ["source"] }
  const target = { kind: "marker", id: "marker", phase: "selected" } satisfies CanvasTargetSelection
  act(root, () => {
    projectActions.selectClips(["clip"])
    projectActions.setTimeSelection(selection)
    scene.setTargetSelection(target)
    initial.timeline.view.stepZoom(1)
  })
  expect(scene.get().viewport.pxPerBar).toBe(96)
  const before = useProjectState.getState()
  const viewport = scene.get().viewport
  const snapshot = serializeProject()
  expect(before.session.preview).toBeNull()
  expect(before.session.canUndo).toBe(false)

  for (const change of [
    () => setPreference("arrangement", { zoom: { stepInFactor: 2, stepAnchorRatio: 0 } }),
    () =>
      setPreference("pointer", {
        ...preferences.getPreference("pointer"),
        dragThresholdPixels: 12,
      }),
  ]) {
    act(root, change)
    expectSameOwners(fixture, initial)
    expect(scene.get().timeSelection).toEqual(selection)
    expect(scene.get().timeSelectionPreview).toBeNull()
    expect(scene.get().targetSelection).toEqual(target)
    expect([...scene.get().selectedClipIds]).toEqual(["clip"])
    expect(scene.get().viewport).toEqual(viewport)
    expect(useProjectState.getState().session.timeSelection).toEqual(selection)
    expect(useProjectState.getState().session.selectedClipIds).toEqual(["clip"])
    expect(useProjectState.getState().session.editEpoch).toBe(before.session.editEpoch)
    expect(useProjectState.getState().session.preview).toBeNull()
    expect(useProjectState.getState().session.canUndo).toBe(false)
    expect(serializeProject()).toBe(snapshot)
  }
  const persisted = createPreferenceOwner({ configDir: fixture.configDir })
  expect(persisted.getPreference("arrangement")?.zoom?.stepInFactor).toBe(2)
  expect(persisted.getPreference("pointer").dragThresholdPixels).toBe(12)
  act(root, () => initial.timeline.view.stepZoom(1))
  expect(scene.get().viewport.pxPerBar).toBe(192)
  expect(useProjectState.getState().workspace.pxPerBar).toBe(192)
  expect(root.renderer.getAllText().join("")).toContain('"pxPerBar":192')

  const start = clipPointer(initial)
  const belowThreshold = pointer(start.x + 6, start.y)
  const aboveThreshold = pointer(start.x + 48, start.y)
  act(root, () => initial.lane.pointerDown(start))
  act(root, () => initial.lane.pointerMove(belowThreshold, true))
  expect(initial.lane.getSnapshot().dragActive).toBe(false)
  expect(useProjectState.getState().session.preview).toBeNull()
  act(root, () => initial.lane.pointerMove(aboveThreshold, true))
  expect(initial.lane.getSnapshot().dragActive).toBe(true)
  expect(useProjectState.getState().session.preview?.kind).toBe("tracks")
  expect(useProjectState.getState().document).toEqual(before.document)
  act(root, () => initial.lane.pointerUp(aboveThreshold))
  await settle(root)
  expect(useProjectState.getState().document.tracks[0]?.clips[0]?.startBar).toBe(2.25)
  expect(useProjectState.getState().session.preview).toBeNull()
  expect(useProjectState.getState().session.canUndo).toBe(true)
  expectSameOwners(fixture, initial)
  act(root, projectActions.undo)
  await settle(root)
  expect(useProjectState.getState().document).toEqual(before.document)
})

test.each(["lane", "ruler"])(
  "live preference changes cancel an active %s preview without a commit or undo entry",
  async gesture => {
    const fixture = mount()
    const { root, preferences } = fixture
    await settle(root)
    const initial = fixture.owner()
    const scene = initial.timeline.sceneStore
    const baseline = useProjectState.getState()
    const snapshot = serializeProject()
    expect(baseline.session.canUndo).toBe(false)
    expect(baseline.session.canRedo).toBe(false)
    const start = clipPointer(initial)
    const end = pointer(start.x + 96, start.y)
    const markerX = (6 - 1) * scene.get().viewport.pxPerBar - scene.get().viewport.scrollX
    const markerY = scene.get().geometry.arrangement.markerRulerHeight / 2
    if (gesture === "lane") {
      act(root, () => initial.lane.pointerDown(start))
      act(root, () => initial.lane.pointerMove(end, true))
      expect(initial.lane.getSnapshot().dragActive).toBe(true)
      expect(useProjectState.getState().session.preview?.kind).toBe("tracks")
      expect(getEffectiveDocument().tracks[0]?.clips[0]?.startBar).not.toBe(2)
    } else {
      expect(rulerHit(scene.get(), { x: markerX, y: markerY })).toMatchObject({ kind: "marker" })
      act(root, () => expect(initial.timeline.view.rulers.down(markerX, markerY)).toBe(true))
      act(root, () => initial.timeline.view.rulers.move(markerX + 64))
      expect(initial.timeline.view.rulers.active).toBe(true)
      expect(useProjectState.getState().session.preview?.kind).toBe("markers")
      expect(getEffectiveDocument().markers[0]?.bar).toBe(7)
    }
    await settle(root)
    expect(useProjectState.getState().document).toEqual(baseline.document)
    expect(serializeProject()).toBe(snapshot)

    act(root, () => {
      if (gesture === "lane") {
        setPreference("pointer", {
          ...preferences.getPreference("pointer"),
          dragThresholdPixels: 12,
        })
      } else {
        setPreference("arrangement", { zoom: { stepInFactor: 2 } })
      }
    })
    expectSameOwners(fixture, initial)
    expect(initial.lane.getSnapshot().dragActive).toBe(false)
    expect(initial.timeline.view.rulers.active).toBe(false)
    expect(useProjectState.getState().session.preview).toBeNull()
    expect(scene.get().clipDrag).toBeNull()
    expect(scene.get().clipResize).toBeNull()
    expect(scene.get().timeSelectionPreview).toBeNull()
    expect(getEffectiveDocument()).toEqual(baseline.document)

    act(root, () => {
      if (gesture === "lane") {
        initial.lane.pointerMove(pointer(end.x + 64, end.y), true)
        initial.lane.pointerUp(pointer(end.x + 64, end.y))
      } else {
        initial.timeline.view.rulers.move(markerX + 128)
        initial.timeline.view.rulers.up()
      }
    })
    await settle(root)
    const after = useProjectState.getState()
    expect(after.document).toEqual(baseline.document)
    expect(serializeProject()).toBe(snapshot)
    expect(after.session.preview).toBeNull()
    expect(after.session.dirty).toBe(baseline.session.dirty)
    expect(after.session.canUndo).toBe(false)
    expect(after.session.canRedo).toBe(false)
    expect(after.session.backend.acceptedRevision).toBe(baseline.session.backend.acceptedRevision)
    act(root, projectActions.undo)
    await settle(root)
    expect(useProjectState.getState().document).toEqual(baseline.document)
    expect(useProjectState.getState().session.canRedo).toBe(false)
  }
)

test.each(["minimapMinHeight", "minimapMaxHeight", "timelineAutoScrollEdge"] as const)(
  "live project metric %s retains owner and selection, cancels preview and updates consumers",
  async metric => {
    const fixture = mount()
    const { root } = fixture
    await settle(root)
    const initial = fixture.owner()
    const scene = initial.timeline.sceneStore
    const baseline = useProjectState.getState().document
    const start = clipPointer(initial)
    act(root, () => {
      projectActions.setTimeSelection({ startBar: 2, endBar: 4, trackIds: ["source"] })
      initial.lane.pointerDown(start)
      initial.lane.pointerMove(pointer(start.x + 96, start.y), true)
    })
    expect(initial.lane.getSnapshot().dragActive).toBe(true)
    const selection = scene.get().targetSelection
    const timeSelection = scene.get().timeSelection
    const project = { ...PROJECT_METRICS, [metric]: PROJECT_METRICS[metric] + 32 }
    act(root, () => fixture.setMetrics(project))
    expectSameOwners(fixture, initial)
    expect(scene.get().targetSelection).toEqual(selection)
    expect(scene.get().timeSelection).toEqual(timeSelection)
    expect(initial.lane.getSnapshot().dragActive).toBe(false)
    expect(useProjectState.getState().session.preview).toBeNull()
    expect(useProjectState.getState().document).toEqual(baseline)
    expect(useProjectState.getState().session.canUndo).toBe(false)
    act(root, () => initial.timeline.view.setOverviewHeight(0))
    expect(initial.timeline.view.getSnapshot().overviewHeight).toBe(project.minimapMinHeight)
    act(root, () => initial.timeline.view.setOverviewHeight(10000))
    expect(initial.timeline.view.getSnapshot().overviewHeight).toBe(project.minimapMaxHeight)
    if (metric === "timelineAutoScrollEdge") {
      const nearEdge = pointer(
        scene.get().viewport.width - PROJECT_METRICS.timelineAutoScrollEdge - 4,
        start.y
      )
      act(root, () => {
        initial.lane.pointerDown(start)
        initial.lane.pointerMove(nearEdge, true)
        initial.lane.step(0)
        initial.lane.step(32)
      })
      expect(scene.get().viewport.scrollX).toBeGreaterThan(0)
      act(root, () => {
        initial.lane.interrupt()
        projectActions.setViewport({ scrollX: 0, scrollY: 0 })
        initial.timeline.view.autoScroll.start(
          { ...nearEdge, windowX: nearEdge.x, windowY: nearEdge.y },
          "horizontal"
        )
        initial.timeline.view.autoScroll.tick(0)
        initial.timeline.view.autoScroll.tick(32)
        initial.timeline.view.autoScroll.stop()
      })
      expect(scene.get().viewport.scrollX).toBeGreaterThan(0)
    }
    await settle(root)
    expect(useProjectState.getState().document).toEqual(baseline)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  }
)
