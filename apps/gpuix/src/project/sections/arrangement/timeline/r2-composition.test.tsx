import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { createProjectComposition } from "@/app/project/composition"
import { ArrangementPanel } from "@/app/project/ArrangementPanel"
import { createAppInteraction } from "@/app/interaction"
import { initAppI18n } from "@/app/i18n"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import {
  hydrateProject,
  serializeProject,
  projectActions,
  useProjectState,
  setProjectFiles,
  startProjectRuntime,
  whenProjectBackendIdle,
  configureProjectBackend,
  createMemoryProjectFiles,
  openProjectFile,
  openNewProject,
} from "@/project/adapters"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { ClipEditor } from "@/project/sections/clip-edit"
import { clipEditorLabels as demoLabels } from "@/app/locales/sections/clip-edit"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { layoutTrackRows } from "../core/layout"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  setProjectFiles(null)
})

function element(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  if (!node) throw new Error(`Missing ${id}`)
  return node
}

async function mount(manyTracks = false, arrangementHeight = 500) {
  initAppI18n({ initialLanguage: "en-US" })
  const document = createMockDocument()
  const source = document.tracks.find(track => track.kind === "midi")
  const main = document.tracks.find(track => track.kind === "main")
  if (!source || !main) throw new Error("Missing source/main fixture")
  source.id = "source"
  source.output = "main"
  source.clips = [{ id: "r2-midi", kind: "midi", startBar: 2, lengthBars: 2, notes: [] }]
  const target = {
    ...structuredClone(source),
    id: "target",
    clips: [{ id: "r2-target", kind: "midi" as const, startBar: 4, lengthBars: 2, notes: [] }],
  }
  document.tracks = [
    source,
    target,
    ...(manyTracks
      ? Array.from({ length: 12 }, (_, index) => ({
          ...structuredClone(source),
          id: `distant-${index}`,
          clips: [],
        }))
      : []),
    main,
  ]
  const workspace = {
    ...createMockWorkspace(),
    drawMode: false,
    computerKeyboard: false,
    automationMode: false,
    pxPerBar: 64,
    scrollX: 0,
    scrollY: 0,
  }
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
  const keyboard = createWindowKeyboard()
  const interaction = createAppInteraction()
  const clipboard = { readText: () => "", writeText: (_value: string) => {} }
  const composition = createProjectComposition({
    geometry: DEFAULT_LAYOUT_TOKENS,
    interaction,
    keyboard,
    clipboard,
    metrics: PROJECT_METRICS,
    subscribeWindowActive: () => () => {},
    blurControl: () => {},
    browserCollapsed: () => true,
    focusBrowserSearch: () => {},
  })
  cleanups.push(composition.dispose)
  const root = createTestRoot({ width: 1280, height: 900, ...keyboard.rootHandlers })
  cleanups.push(root.unmount)
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ textFocus: interaction.textFocus }}>
          <WindowKeyboardProvider value={keyboard}>
            <div
              style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}
            >
              <div style={{ height: arrangementHeight }}>
                <ArrangementPanel composition={composition} />
              </div>
              <div role="button" testId="after-arrangement" tabIndex={0}>
                After arrangement
              </div>
              <div style={{ height: 350 }}>
                <ClipEditor
                  clipId="r2-midi"
                  trackId="source"
                  labels={demoLabels.en}
                  close={() => {}}
                  readPeaks={() => new Float32Array(0)}
                  environment={{
                    clipboard,
                    subscribeWindowActive: () => () => {},
                    drawMode: {
                      markGesture: composition.timeline.keyboard.markDrawGesture,
                      latch: composition.timeline.keyboard.latchDraw,
                    },
                    onRegionKey: composition.onClipRegionKey,
                  }}
                />
              </div>
            </div>
          </WindowKeyboardProvider>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
  return { root, composition }
}

test.each(["cmd-s", "ctrl-s"])(
  "real ClipEditor %s saves the accepted project through the window owner",
  async key => {
    const { root } = await mount()
    cleanups.push(configureProjectBackend(createNativeBackend))
    cleanups.push(startProjectRuntime())
    expect(await whenProjectBackendIdle()).toBe(true)
    const files = createMemoryProjectFiles()
    setProjectFiles(files)
    flushSync(() => projectActions.saveAs("/projects/R2 Project/R2.zdaw"))
    expect(await whenProjectBackendIdle()).toBe(true)
    flushSync(() => projectActions.updateClip("r2-midi", { label: "Saved from editor" }))
    expect(await whenProjectBackendIdle()).toBe(true)
    expect(useProjectState.getState().session.dirty).toBe(true)
    root.renderer.nativeSimulateKeystrokes(element(root, "midi-grid").id, key)
    await whenProjectBackendIdle()
    await Bun.sleep(0)
    expect(useProjectState.getState().session.dirty).toBe(false)
    expect(
      [...files.entries.values()].map(text => JSON.parse(text).document.tracks[0].clips[0].label)
    ).toEqual(["Saved from editor"])
  }
)

test("the arrangement editing surface has one stable Tab owner across rows and clips", async () => {
  const { root, composition } = await mount()
  const viewport = element(root, "timeline-viewport")
  const box = root.renderer.getElementBounds(element(root, "clip-source-r2-midi").id)
  if (!box) throw new Error("Missing clip bounds")
  root.renderer.nativeSimulateClick(box.x + 20, box.y + 6)
  expect(root.renderer.getFocusedElementId()).toBe(viewport.id)
  root.renderer.simulateKeystrokes("tab")
  const next = root.renderer.getFocusedElementId()
  const forbidden = [
    "lane-row-source",
    "lane-row-target",
    "clip-source-r2-midi",
    "clip-target-r2-target",
    "track-lane-source",
    "track-lane-target",
  ]
    .map(id => root.renderer.findByTestId(id)?.id)
    .filter(id => id !== undefined)
  expect(forbidden).not.toContain(next)
  expect(next).not.toBe(viewport.id)
  const visited: (number | null)[] = []
  for (let step = 0; step < 200; step++) {
    root.renderer.simulateKeystrokes("tab")
    const focused = root.renderer.getFocusedElementId()
    visited.push(focused)
    if (focused === viewport.id) break
  }
  expect(visited).toContain(viewport.id)
  for (const id of forbidden) expect(visited).not.toContain(id)
  root.renderer.focusElement(viewport.id)
  flushSync(() => composition.timeline.setScroll(100, 0))
  expect(root.renderer.getFocusedElementId()).toBe(viewport.id)
})

test("focus leaving the stable editing surface cancels a lane drag without document or history changes", async () => {
  const { root, composition } = await mount()
  const clip = element(root, "clip-source-r2-midi")
  const box = root.renderer.getElementBounds(clip.id)
  if (!box) throw new Error("Missing clip bounds")
  const before = useProjectState.getState().document
  root.renderer.nativeSimulateMouseDown(box.x + 20, box.y + 6)
  root.renderer.nativeSimulateMouseMove(box.x + 148, box.y + 6, 0)
  expect(composition.timeline.sceneStore.get().clipDrag).not.toBeNull()
  root.renderer.simulateKeystrokes("tab")
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.nativeSimulateMouseUp(box.x + 148, box.y + 6)
  expect(composition.timeline.sceneStore.get().clipDrag).toBeNull()
  expect(useProjectState.getState().document).toEqual(before)
  expect(useProjectState.getState().session.preview).toBeNull()
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

test("a retained lane capture completes a cross-track move after scrolling unmounts its source row", async () => {
  const { root, composition } = await mount(true)
  const viewport = element(root, "timeline-viewport")
  const box = root.renderer.getElementBounds(element(root, "clip-source-r2-midi").id)
  if (!box) throw new Error("Missing source bounds")
  root.renderer.nativeSimulateMouseDown(box.x + 20, box.y + 6)
  root.renderer.nativeSimulateMouseMove(box.x + 148, box.y + 6, 0)
  expect(composition.timeline.sceneStore.get().clipDrag).not.toBeNull()
  const distant = layoutTrackRows(composition.timeline.sceneStore.get()).find(
    row => row.track.id === "distant-6"
  )
  if (!distant) throw new Error("Missing distant track")
  flushSync(() =>
    composition.timeline.setScroll(0, distant.top - distant.arrangementGeometry.barRulerHeight)
  )
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  expect(root.renderer.findByTestId("lane-row-source")).toBeUndefined()
  expect(root.renderer.getFocusedElementId()).toBe(viewport.id)
  const retained = root.renderer.getElementBounds(viewport.id)
  const row = layoutTrackRows(composition.timeline.sceneStore.get()).find(
    row => row.track.id === "distant-6"
  )
  if (!retained || !row) throw new Error("Missing retained target geometry")
  const x = retained.x + 212
  const y = retained.y + row.top - row.arrangementGeometry.barRulerHeight + 6
  root.renderer.nativeSimulateMouseMove(x, y, 0)
  root.renderer.nativeSimulateMouseUp(x, y)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "source")?.clips
  ).toEqual([])
  expect(
    useProjectState
      .getState()
      .document.tracks.find(track => track.id === "distant-6")
      ?.clips.map(clip => [clip.id, clip.startBar])
  ).toEqual([["r2-midi", 4]])
  expect(useProjectState.getState().session.canUndo).toBe(true)
  expect(composition.timeline.sceneStore.get().clipDrag).toBeNull()
})

test("native lane and header wheels each pan once and use the same zoom factor", async () => {
  const { root, composition } = await mount(true)
  const lane = root.renderer.getElementBounds(element(root, "timeline-viewport").id)
  const layout = root.renderer.getElementBounds(element(root, "timeline-layout").id)
  if (!lane || !layout) throw new Error("Missing wheel geometry")
  const y = lane.y + 40
  root.renderer.nativeSimulateScrollWheel(lane.x + 100, y, -24, 0)
  expect(useProjectState.getState().workspace.scrollX).toBe(24)
  flushSync(() => composition.timeline.setScroll(0, 0))
  root.renderer.nativeSimulateScrollWheel(layout.x + lane.width + 20, y, -24, 0)
  expect(useProjectState.getState().workspace.scrollX).toBe(24)
  flushSync(() => projectActions.setViewport({ pxPerBar: 64, scrollX: 0, scrollY: 0 }))
  root.renderer.nativeSimulateScrollWheel(lane.x + 100, y, 0, -20, "cmd")
  const laneZoom = useProjectState.getState().workspace.pxPerBar
  flushSync(() => projectActions.setViewport({ pxPerBar: 64, scrollX: 0, scrollY: 0 }))
  root.renderer.nativeSimulateScrollWheel(layout.x + lane.width + 20, y, 0, -20, "cmd")
  expect(useProjectState.getState().workspace.pxPerBar).toBe(laneZoom)
})

test("the lane-side track separator resizes above the input layer without stealing other lane clicks", async () => {
  const { root, composition } = await mount()
  const separator = root.renderer.getElementBounds(element(root, "track-resize-source").id)
  const clip = root.renderer.getElementBounds(element(root, "clip-source-r2-midi").id)
  if (!separator || !clip) throw new Error("Missing resize geometry")
  const source = useProjectState.getState().document.tracks.find(track => track.id === "source")
  if (!source) throw new Error("Missing resize source")
  const x = separator.x + 20
  const y = separator.y + separator.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x, y + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 2, 0)
  root.renderer.nativeSimulateMouseUp(x, y + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 2)
  expect(
    useProjectState.getState().document.tracks.find(track => track.id === "source")?.heightPx
  ).toBe(source.heightPx + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 2)
  expect(composition.timeline.sceneStore.get().clipDrag).toBeNull()
  root.renderer.nativeSimulateClick(clip.x + 20, clip.y + 6)
  expect(useProjectState.getState().session.selectedClipIds).toEqual(["r2-midi"])
  expect(root.renderer.getFocusedElementId()).toBe(element(root, "timeline-viewport").id)
})

for (const trackId of ["source", "main"]) {
  test.each(["commit", "escape"])(
    `an active track resize crosses the visible boundary for ${trackId} and can %s`,
    async ending => {
      const { root, composition } = await mount(false, 320)
      const separator = element(root, `track-resize-${trackId}`)
      const bounds = root.renderer.getElementBounds(separator.id)
      const before = useProjectState
        .getState()
        .document.tracks.find(track => track.id === trackId)?.heightPx
      if (!bounds || before === undefined) throw new Error("Missing resize baseline")
      const direction = trackId === "main" ? -1 : 1
      const x = bounds.x + 20
      const y = bounds.y + bounds.height / 2
      root.renderer.nativeSimulateMouseDown(x, y)
      root.renderer.nativeSimulateMouseMove(
        x,
        y + direction * DEFAULT_LAYOUT_TOKENS.track.resizeStep * 8,
        0
      )
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      expect(
        useProjectState.getState().document.tracks.find(track => track.id === trackId)?.heightPx
      ).toBe(before + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 8)
      expect(root.renderer.getFocusedElementId()).toBe(separator.id)
      const rows = layoutTrackRows(composition.timeline.sceneStore.get())
      const row = rows.find(item => item.track.id === trackId)
      const main = rows.find(item => item.track.id === "main")
      if (!row || !main) throw new Error("Missing current resize bounds")
      if (trackId === "main") expect(row.top).toBeLessThan(row.arrangementGeometry.barRulerHeight)
      else expect(row.top + row.height).toBeGreaterThan(main.top)
      if (ending === "escape") {
        root.renderer.simulateKeystrokes("escape")
        root.renderer.nativeSimulateMouseUp(
          x,
          y + direction * DEFAULT_LAYOUT_TOKENS.track.resizeStep * 8
        )
        expect(
          useProjectState.getState().document.tracks.find(track => track.id === trackId)?.heightPx
        ).toBe(before)
        expect(useProjectState.getState().session.canUndo).toBe(false)
      } else {
        root.renderer.nativeSimulateMouseMove(
          x,
          y + direction * DEFAULT_LAYOUT_TOKENS.track.resizeStep * 9,
          0
        )
        root.renderer.nativeSimulateMouseUp(
          x,
          y + direction * DEFAULT_LAYOUT_TOKENS.track.resizeStep * 9
        )
        expect(
          useProjectState.getState().document.tracks.find(track => track.id === trackId)?.heightPx
        ).toBe(before + DEFAULT_LAYOUT_TOKENS.track.resizeStep * 9)
        expect(useProjectState.getState().session.canUndo).toBe(true)
        flushSync(projectActions.undo)
        expect(
          useProjectState.getState().document.tracks.find(track => track.id === trackId)?.heightPx
        ).toBe(before)
        expect(useProjectState.getState().session.canUndo).toBe(false)
      }
    }
  )
}

test("the Save control disables for a damaged opened file and re-enables after opening a clean one", async () => {
  const { root } = await mount()
  const save = element(root, "timeline-save")
  const enabledOpacity = typeof save.style.opacity === "number" ? save.style.opacity : 1
  const files = createMemoryProjectFiles()
  const damagedPath = "/projects/Damaged Project/Damaged.zdaw"
  const raw = "damaged project must not be overwritten"
  files.entries.set(damagedPath, raw)
  files.entries.set("/projects/Clean Project/Clean.zdaw", serializeProject())
  setProjectFiles(files)
  cleanups.push(() => openNewProject("default"))
  let opened = true
  flushSync(() => {
    opened = openProjectFile(damagedPath)
  })
  expect(opened).toBe(false)
  expect(root.renderer.getElement(save.id)?.style.opacity ?? 1).toBeLessThan(enabledOpacity)
  const bounds = root.renderer.getElementBounds(save.id)
  if (!bounds) throw new Error("Missing Save bounds")
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  root.renderer.nativeSimulateKeystrokes(element(root, "timeline-viewport").id, "cmd-s")
  expect(files.entries.get(damagedPath)).toBe(raw)
  flushSync(() => {
    opened = openProjectFile("/projects/Clean Project/Clean.zdaw")
  })
  expect(opened).toBe(true)
  expect(root.renderer.getElement(save.id)?.style.opacity ?? 1).toBe(enabledOpacity)
})
