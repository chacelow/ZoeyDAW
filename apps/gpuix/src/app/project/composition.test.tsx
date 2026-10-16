import { afterEach, beforeEach, expect, test } from "bun:test"
import { useState } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import {
  activeAutomationRows,
  automationY,
} from "@/project/sections/arrangement/core/automation/geometry"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Input, DragPadNumber, ControlEnvironmentProvider, MotionTabs } from "@/ui/controls"
import { Group, Panel, Separator } from "@/ui/panels"
import { initAppI18n } from "../i18n"
import { createAppInteraction } from "../interaction"
import { ArrangementPanel } from "./ArrangementPanel"
import { createProjectComposition } from "./composition"
import type { TestRoot } from "@gpuix/react/testing"
import type { LanePointer } from "@/project/sections/arrangement/lane"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})
beforeEach(() => {
  initAppI18n({ initialLanguage: "en-US" })
  const document = createMockDocument()
  const source = document.tracks.find(track => track.kind === "midi")
  const main = document.tracks.find(track => track.kind === "main")
  if (!source || !main) throw new Error("Fixture lacks source/Main")
  source.id = "source"
  source.output = "main"
  source.clips = [{ id: "clip", kind: "midi", startBar: 2, lengthBars: 2, notes: [] }]
  source.automation = [
    { id: "volume", parameter: "volume", points: [] },
    { id: "pan", parameter: "pan", points: [] },
  ]
  document.tracks = [source, main]
  const workspace = createMockWorkspace()
  workspace.drawMode = false
  workspace.automationMode = false
  workspace.computerKeyboard = false
  workspace.pxPerBar = 64
  workspace.scrollX = 0
  workspace.scrollY = 0
  workspace.grid = { mode: "fixed", bars: 0.25 }
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
})

function mount({ autoFocusInput = false, readOnlyInput = false } = {}) {
  const keyboard = createWindowKeyboard()
  const interaction = createAppInteraction()
  let clipboard = ""
  const composition = createProjectComposition({
    interaction,
    keyboard,
    clipboard: {
      readText: () => clipboard,
      writeText: value => {
        clipboard = value
      },
    },
    metrics: PROJECT_METRICS,
    subscribeWindowActive: () => () => {},
    blurControl: () => {},
    browserCollapsed: () => true,
    focusBrowserSearch: () => {
      throw new Error("No Browser mounted")
    },
  })
  cleanups.push(composition.dispose)
  const root = createTestRoot({ width: 1280, height: 800, ...keyboard.rootHandlers })
  cleanups.push(root.unmount)
  function TextEditor() {
    const [value, setValue] = useState("seed")
    return (
      <Input
        testId="text-editor"
        aria-label="Text"
        value={value}
        onValueChange={setValue}
        autoFocus={autoFocusInput}
        readOnly={readOnlyInput}
      />
    )
  }
  root.render(
    <AnimationFrameProvider source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}>
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ textFocus: interaction.textFocus }}>
          <WindowKeyboardProvider value={keyboard}>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <TextEditor />
              <MotionTabs
                options={[
                  { key: "devices", label: "Devices" },
                  { key: "clip", label: "Clip" },
                ]}
              />
              <Group orientation="horizontal" style={{ width: 800, height: 100 }}>
                <Panel defaultSize="50" testId="keyboard-left">
                  <text>Browser</text>
                </Panel>
                <Separator testId="keyboard-divider" aria-label="Resize browser" />
                <Panel>
                  <text>Content</text>
                </Panel>
              </Group>
              <DragPadNumber
                testId="number-editor"
                label="Octave"
                value={4}
                min={0}
                max={8}
                step={1}
                onChange={() => {}}
              />
              <div style={{ flexGrow: 1, minHeight: 0 }}>
                <ArrangementPanel composition={composition} />
              </div>
            </div>
          </WindowKeyboardProvider>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
  root.renderer.flush()
  return { root, composition, interaction, keyboard }
}

function element(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  return node
}

async function layout(root: TestRoot) {
  for (let pass = 0; pass < 4; pass++) {
    await Bun.sleep(20)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}

function pointer(x: number, y: number): LanePointer {
  return { x, y, button: 0, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }
}

test("held B + real lane drawing + keyup does not latch the Draw preference; an unused tap does", async () => {
  const { root, composition } = mount()
  await layout(root)
  flushSync(() => projectActions.setMode("automationMode", true))
  const target = element(root, "timeline-viewport")
  root.renderer.nativeSimulateKeyDown(target.id, "b")
  expect(useProjectState.getState().session.drawModeOverride).toBe(true)
  const row = activeAutomationRows(composition.timeline.sceneStore.get()).find(
    item => item.track.id === "source"
  )
  if (!row) throw new Error("No automation row")
  const start = pointer(32, automationY(row, 0.4))
  flushSync(() => {
    composition.lane.pointerDown(start)
    composition.lane.pointerMove(pointer(96, automationY(row, 0.7)), true)
    composition.lane.pointerUp(pointer(96, automationY(row, 0.7)))
  })
  expect(
    useProjectState.getState().document.tracks[0]?.automation[0]?.points.map(point => point.bar)
  ).toContain(2)
  root.renderer.nativeSimulateKeyUp(target.id, "b")
  expect(useProjectState.getState().workspace.drawMode).toBe(false)
  expect(useProjectState.getState().session.drawModeOverride).toBeNull()
  root.renderer.nativeSimulateKeyDown(target.id, "b")
  root.renderer.nativeSimulateKeyUp(target.id, "b")
  expect(useProjectState.getState().workspace.drawMode).toBe(true)
})

test("one native key sequence has one owner: lane duplicate once, timeline A once, project undo once", async () => {
  const { root } = mount()
  await layout(root)
  flushSync(() => projectActions.selectClips(["clip"]))
  const lane = element(root, "lane-row-source")
  root.renderer.nativeSimulateKeystrokes(lane.id, "cmd-d")
  const clips = useProjectState.getState().document.tracks[0]?.clips ?? []
  expect(clips.map(clip => clip.startBar)).toEqual([2, 4])
  root.renderer.nativeSimulateKeystrokes(lane.id, "a")
  expect(useProjectState.getState().workspace.automationMode).toBe(true)
  root.renderer.nativeSimulateKeystrokes(lane.id, "cmd-z")
  expect(useProjectState.getState().workspace.automationMode).toBe(false)
  expect(useProjectState.getState().document.tracks[0]?.clips.map(clip => clip.startBar)).toEqual([
    2, 4,
  ])
})

for (const kind of ["Input", "Input autoFocus", "DragPad"] as const) {
  test(`${kind} native text focus protects a, Cmd+A and grid shortcuts until blur/unmount`, async () => {
    const { root, interaction, composition } = mount({ autoFocusInput: kind === "Input autoFocus" })
    await layout(root)
    if (kind === "Input") root.renderer.focusElement(element(root, "text-editor").id)
    else if (kind === "DragPad")
      root.renderer.nativeSimulateKeystrokes(element(root, "number-editor").id, "enter")
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    expect(interaction.isTextFocused()).toBe(true)
    const before = useProjectState.getState().workspace
    root.renderer.simulateKeystrokes("a cmd-a a cmd-1 m b")
    expect(useProjectState.getState().workspace).toMatchObject({
      automationMode: before.automationMode,
      drawMode: before.drawMode,
      computerKeyboard: before.computerKeyboard,
      grid: before.grid,
    })
    if (kind !== "DragPad")
      expect(root.renderer.getElement(element(root, "text-editor").id)?.customProps?.value).toBe(
        "amb"
      )
    // Exercise the composition focus port even when the native editor consumes printable keys.
    expect(composition.timeline.keyboard.down({ key: "a", defaultPrevented: false })).toBe(false)
    expect(useProjectState.getState().workspace.automationMode).toBe(before.automationMode)
    root.renderer.nativeSimulateKeystrokes(element(root, "timeline-viewport").id, "a")
    expect(interaction.isTextFocused()).toBe(false)
    expect(useProjectState.getState().workspace.automationMode).toBe(!before.automationMode)
    root.unmount()
    expect(interaction.isTextFocused()).toBe(false)
  })
}

test("real TrackRows lane slot uses the timeline time width and positions headers after it", async () => {
  const { root, composition } = mount()
  await layout(root)
  const view = composition.timeline.sceneStore.get().viewport
  const bounds = (id: string) => {
    const box = root.renderer.getElementBounds(element(root, id).id)
    if (!box) throw new Error(`Unpainted ${id}`)
    return box
  }
  const lane = bounds("track-lane-source")
  const contents = bounds("lane-row-source")
  const rows = bounds("track-rows")
  expect(lane.width).toBe(view.width)
  expect(contents.width).toBe(lane.width)
  expect(rows.width).toBe(view.width + PROJECT_METRICS.controlsWidth)
  const viewport = bounds("timeline-layout")
  expect(rows.width).toBe(viewport.width)
  expect(lane.x + lane.width).toBe(viewport.x + view.width)
  expect(bounds("track-rails-source").x).toBe(lane.x + lane.width)
})

test("timeline projection updates lane automation geometry when the track parameter changes", async () => {
  const { root, composition } = mount()
  await layout(root)
  flushSync(() => projectActions.setAutomationParameter("source", "pan"))
  const rows = activeAutomationRows(composition.timeline.sceneStore.get())
  expect(rows.find(row => row.track.id === "source")).toMatchObject({
    parameter: "pan",
    laneId: "pan",
  })
  flushSync(() => projectActions.setAutomationParameter("source", "volume"))
  expect(
    activeAutomationRows(composition.timeline.sceneStore.get()).find(
      row => row.track.id === "source"
    )
  ).toMatchObject({ parameter: "volume", laneId: "volume" })
})

test("focused readOnly Input keeps native selection and blocks Arrangement modes and select-all", async () => {
  const { root, composition, interaction } = mount({ readOnlyInput: true })
  await layout(root)
  const input = element(root, "text-editor")
  root.renderer.nativeSimulateKeystrokes(input.id, "cmd-a a m b")
  expect(root.renderer.getFocusedElementId()).toBe(input.id)
  expect(root.renderer.getElement(input.id)?.customProps?.value).toBe("seed")
  expect(useProjectState.getState().workspace).toMatchObject({
    automationMode: false,
    computerKeyboard: false,
    drawMode: false,
  })
  expect(useProjectState.getState().session.selectedClipIds).toEqual([])
  expect(
    composition.timeline.keyboard.down({
      key: "a",
      defaultPrevented: false,
      modifiers: { cmd: true, ctrl: false, alt: false, shift: false },
    })
  ).toBe(false)
  expect(useProjectState.getState().session.selectedClipIds).toEqual([])
  expect(interaction.isTextFocused()).toBe(true)
  root.renderer.nativeSimulateKeystrokes(element(root, "timeline-viewport").id, "a")
  expect(interaction.isTextFocused()).toBe(false)
  expect(useProjectState.getState().workspace.automationMode).toBe(true)
})

test("tab navigation and panel resize consume arrows without seeking; Space still plays", async () => {
  const { root } = mount()
  await layout(root)
  flushSync(() => projectActions.seekBar(8))
  const before = { ...useProjectState.getState().session.position }
  root.renderer.nativeSimulateKeystrokes(element(root, "motion-tab-devices").id, "right")
  expect(root.renderer.getFocusedElementId()).toBe(element(root, "motion-tab-clip").id)
  expect(useProjectState.getState().session.position).toEqual(before)
  const panel = element(root, "keyboard-left")
  const width = root.renderer.getElementBounds(panel.id)?.width
  root.renderer.nativeSimulateKeystrokes(element(root, "keyboard-divider").id, "right")
  expect(root.renderer.getElementBounds(panel.id)?.width).toBeGreaterThan(width ?? 0)
  expect(useProjectState.getState().session.position).toEqual(before)
  const playing = useProjectState.getState().session.playing
  root.renderer.nativeSimulateKeystrokes(element(root, "keyboard-divider").id, "space")
  expect(useProjectState.getState().session.playing).toBe(!playing)
})
