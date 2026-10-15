import { beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { TransportBar } from "."
import { englishTransportLabels } from "./demo-labels"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { AnimationFrameProvider } from "@/platform/frame"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createVerificationKeyboard } from "../footer/verification/keyboard"
import { createTestWindowActivity } from "../footer/verification/test-activity"
import { createTestAnimationFrames } from "../footer/verification/test-frame"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
)
function mount(width = 1800) {
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width, height: 400, ...keyboard.rootHandlers })
  const activity = createTestWindowActivity()
  const frames = createTestAnimationFrames()
  const owner = createVerificationKeyboard({
    windowKeyboard: keyboard,
    metrics: PROJECT_METRICS,
    size: { containerWidth: width, bodyHeight: 400, timelineLeft: 0 },
    subscribeWindowActive: activity.subscribe,
    blurControl: () => {
      const sink = root.renderer.findByTestId("keyboard-focus-surface")
      if (sink) root.renderer.focusElement(sink.id)
    },
  })
  root.render(
    <ThemeProvider>
      <WindowKeyboardProvider value={keyboard}>
        <AnimationFrameProvider source={frames}>
          <div
            testId="keyboard-focus-surface"
            tabIndex={-1}
            style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
          >
            <TransportBar
              labels={englishTransportLabels}
              reducedMotion={false}
              onDrawModeChange={owner.timeline.keyboard.latchDraw}
              onBack={projectActions.stop}
              onToggleBrowser={() => {
                throw new Error("Unexpected browser input")
              }}
            />
          </div>
        </AnimationFrameProvider>
      </WindowKeyboardProvider>
    </ThemeProvider>
  )
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  const unmount = root.unmount
  root.unmount = () => {
    unmount()
    owner.dispose()
  }
  return root
}

test("Space on a focused Record button toggles playback without arming recording", () => {
  const root = mount()
  try {
    const record = root.renderer.findByTestId("transport-record")
    if (!record) throw new Error("Missing record")
    root.renderer.nativeSimulateKeystrokes(record.id, "space")
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(useProjectState.getState().session.recording).toBe(false)
    root.renderer.nativeSimulateKeystrokes(record.id, "space")
    expect(useProjectState.getState().session.playing).toBe(false)
    expect(useProjectState.getState().session.recording).toBe(false)
    root.renderer.nativeSimulateKeystrokes(record.id, "enter")
    expect(useProjectState.getState().session.recording).toBe(true)
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("Space on the engine popup trigger controls playback without opening the popup", () => {
  const root = mount()
  try {
    const engine = root.renderer.findByTestId("transport-engine")
    if (!engine) throw new Error("Missing engine trigger")
    root.renderer.nativeSimulateKeystrokes(engine.id, "space")
    expect(root.renderer.findByTestId("transport-engine-content")).toBeUndefined()
    expect(useProjectState.getState().session.playing).toBe(true)
    root.renderer.nativeSimulateKeystrokes(engine.id, "enter")
    expect(root.renderer.findByTestId("transport-engine-content")).toBeDefined()
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("Space on a scale dropdown controls playback without changing scale or opening choices", () => {
  const root = mount()
  try {
    const mode = root.renderer.findByTestId("transport-scale-mode")
    if (!mode) throw new Error("Missing scale mode")
    const original = useProjectState.getState().document.scaleMode
    root.renderer.nativeSimulateKeystrokes(mode.id, "space")
    expect(useProjectState.getState().document.scaleMode).toBe(original)
    expect(root.renderer.findByTestId("transport-scale-mode-content")).toBeUndefined()
    expect(useProjectState.getState().session.playing).toBe(true)
    root.renderer.nativeSimulateKeystrokes(mode.id, "enter")
    expect(root.renderer.findByTestId("transport-scale-mode-content")).toBeDefined()
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("narrow headers keep central buttons square and every control group non-overlapping", () => {
  const root = mount(620)
  try {
    const play = root.renderer.findByTestId("transport-play")
    const stop = root.renderer.findByTestId("transport-stop")
    const record = root.renderer.findByTestId("transport-record")
    if (!play || !stop || !record) throw new Error("Missing transport controls")
    const playBounds = root.renderer.getElementBounds(play.id)
    const stopBounds = root.renderer.getElementBounds(stop.id)
    const recordBounds = root.renderer.getElementBounds(record.id)
    if (!playBounds || !stopBounds || !recordBounds) throw new Error("Missing button bounds")
    expect(playBounds.width).toBe(playBounds.height)
    expect(stopBounds.width).toBe(playBounds.width)
    expect(recordBounds.width).toBe(playBounds.width)
    expect(playBounds.x + playBounds.width).toBeLessThanOrEqual(stopBounds.x)
    expect(stopBounds.x + stopBounds.width).toBeLessThanOrEqual(recordBounds.x)
    const groups = ["transport-left", "transport-center", "transport-right"].map(id => {
      const element = root.renderer.findByTestId(id)
      const bounds = element ? root.renderer.getElementBounds(element.id) : null
      if (!bounds) throw new Error(`Missing group ${id}`)
      return bounds
    })
    for (let index = 1; index < groups.length; index++) {
      const previous = groups[index - 1]
      const current = groups[index]
      if (!previous || !current) throw new Error("Missing adjacent groups")
      expect(previous.x + previous.width).toBeLessThanOrEqual(current.x)
    }
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("held Space repeats do not toggle the transport more than once", () => {
  const root = mount()
  try {
    const record = root.renderer.findByTestId("transport-record")
    if (!record) throw new Error("Missing record")
    root.renderer.nativeSimulateKeyDown(record.id, "space", false)
    expect(useProjectState.getState().session.playing).toBe(true)
    root.renderer.nativeSimulateKeyDown(record.id, "space", true)
    root.renderer.nativeSimulateKeyDown(record.id, "space", true)
    root.renderer.nativeSimulateKeyUp(record.id, "space")
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(useProjectState.getState().session.recording).toBe(false)
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("wide Header centres its transport group between balanced outer columns", () => {
  const root = mount(1800)
  try {
    const center = root.renderer.findByTestId("transport-center")
    const bounds = center ? root.renderer.getElementBounds(center.id) : null
    if (!bounds) throw new Error("Missing center group")
    expect(Math.abs(bounds.x + bounds.width / 2 - 900)).toBeLessThanOrEqual(0.5)
  } finally {
    root.unmount()
  }
})

test("vertical wheel in a Header gap accesses horizontal overflow", () => {
  const root = mount(620)
  try {
    const left = root.renderer.findByTestId("transport-left")
    const scroll = root.renderer.findByTestId("transport-scroll")
    const bounds = left ? root.renderer.getElementBounds(left.id) : null
    if (!bounds || !scroll) throw new Error("Missing Header geometry")
    root.renderer.nativeSimulateScrollWheel(
      bounds.x + bounds.width + PROJECT_METRICS.transportColumnGap / 2,
      bounds.y + bounds.height / 2,
      0,
      -80
    )
    expect(root.renderer.getScrollOffset(scroll.id)?.[0]).toBeLessThan(0)
  } finally {
    root.unmount()
  }
})

test("BPM wheel clamps at the project maximum without scrolling the Header and is undoable", () => {
  projectActions.setBpm(998.99)
  const root = mount(620)
  try {
    const bpm = root.renderer.findByTestId("transport-bpm")
    const scroll = root.renderer.findByTestId("transport-scroll")
    const bounds = bpm ? root.renderer.getElementBounds(bpm.id) : null
    if (!bounds || !scroll) throw new Error("Missing BPM geometry")
    root.renderer.nativeSimulateMouseMove(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    root.renderer.nativeSimulateScrollWheel(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      0,
      32
    )
    expect(useProjectState.getState().document.transport.bpm).toBe(999)
    expect(root.renderer.getScrollOffset(scroll.id)?.[0]).toBe(0)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(998.99)
  } finally {
    root.unmount()
  }
})

test("BPM drag uses its coarse drag step and creates one undo", () => {
  const root = mount()
  try {
    const bpm = root.renderer.findByTestId("transport-bpm")
    const bounds = bpm ? root.renderer.getElementBounds(bpm.id) : null
    if (!bounds) throw new Error("Missing BPM geometry")
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    root.renderer.nativeSimulateMouseDown(x, y)
    root.renderer.nativeSimulateMouseMove(x, y - 20, 0)
    root.renderer.nativeSimulateMouseUp(x, y - 20)
    expect(useProjectState.getState().document.transport.bpm).toBe(125)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  } finally {
    root.unmount()
  }
})

test("BPM keyboard fine adjustment preserves decimals independently of coarse motion and can undo", () => {
  const root = mount()
  try {
    const bpm = root.renderer.findByTestId("transport-bpm")
    if (!bpm) throw new Error("Missing BPM")
    root.renderer.nativeSimulateKeystrokes(bpm.id, "up")
    expect(useProjectState.getState().document.transport.bpm).toBeCloseTo(120.01, 8)
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
  } finally {
    root.unmount()
  }
})
