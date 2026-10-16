import { VERIFICATION_CONTROL_INPUT_POLICY } from "@/app/control-input"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ElementBounds } from "@gpuix/native"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AnimationFrameProvider } from "@/platform/frame"
import { projectActions, useProjectState } from "@/project/adapters"
import { createDevice } from "@/project/model/devices"
import { BrowserPanel } from "@/project/sections/browser"
import { englishBrowserLabels } from "@/app/locales/sections/browser"
import { TransportBar } from "@/project/sections/transport"
import { englishTransportLabels } from "@/app/locales/sections/transport"
import { StatusStrip } from "@/project/sections/status"
import { englishStatusLabels } from "@/app/locales/sections/status"
import { FooterPanel } from "@/project/sections/footer"
import { englishFooterLabels } from "@/app/locales/sections/footer"
import { createTestAnimationFrames } from "@/project/sections/footer/verification/test-frame"
import { createTestWindowActivity } from "@/project/sections/footer/verification/test-activity"
import type { FooterView } from "@/project/sections/footer"
import { initializeVerificationProject } from "../project-creation"

const releaseCreation = initializeVerificationProject("footer-states")
const outputDirectory = path.resolve(
  process.argv[2] ?? path.join(import.meta.dir, "../evidence/gpu-states")
)
mkdirSync(outputDirectory, { recursive: true })
const states: Array<{
  name: string
  screenshot: string
  viewport: { width: number; height: number }
  bounds: Record<string, ElementBounds>
  values: Record<string, unknown>
}> = []
const errors: Array<{ section: string; message: string }> = []

function required(root: TestRoot, testId: string) {
  const element = root.renderer.findByTestId(testId)
  if (!element) throw new Error(`Missing ${testId}`)
  return element
}

function bounds(root: TestRoot, testId: string): ElementBounds {
  const element = required(root, testId)
  const box = root.renderer.getElementBounds(element.id)
  if (!box) throw new Error(`Missing native bounds for ${testId}`)
  return box
}

function center(box: ElementBounds) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function click(root: TestRoot, testId: string) {
  const point = center(bounds(root, testId))
  root.renderer.nativeSimulateClick(point.x, point.y)
  root.renderer.flush()
  return point
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function capture(
  root: TestRoot,
  name: string,
  viewport: { width: number; height: number },
  ids: readonly string[],
  values: Record<string, unknown>
) {
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  const observed = Object.fromEntries(ids.map(id => [id, bounds(root, id)]))
  const screenshot = `${name}.png`
  root.renderer.captureScreenshot(path.join(outputDirectory, screenshot))
  states.push({ name, screenshot, viewport, bounds: observed, values })
}

function run(
  section: string,
  viewport: { width: number; height: number },
  work: (root: TestRoot) => void
) {
  let root: TestRoot | undefined
  try {
    root = createTestRoot(viewport)
    work(root)
  } catch (error) {
    errors.push({
      section,
      message: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
  } finally {
    try {
      root?.unmount()
    } catch (error) {
      errors.push({ section, message: `Unmount: ${String(error)}` })
    }
    projectActions.stop()
  }
}

function FooterHarness() {
  const [view, setView] = useState<FooterView>("devices")
  const [collapsed, setCollapsed] = useState(false)
  const [activity] = useState(createTestWindowActivity)
  return (
    <FooterPanel
      labels={englishFooterLabels}
      view={view}
      collapsed={collapsed}
      onViewChange={setView}
      onCollapsedChange={setCollapsed}
      reducedMotion
      subscribeWindowActive={activity.subscribe}
      renderClipEditor={() => {
        throw new Error("No clip was selected for this proof")
      }}
    />
  )
}

const transportViewport = { width: 1800, height: 120 }
run("transport", transportViewport, root => {
  const frames = createTestAnimationFrames()
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider value={{ inputPolicy: VERIFICATION_CONTROL_INPUT_POLICY }}>
        <AnimationFrameProvider source={frames}>
          <TransportBar
            labels={englishTransportLabels}
            reducedMotion
            onBack={projectActions.stop}
            onDrawModeChange={() => {
              throw new Error("Unexpected draw mode input")
            }}
            onToggleBrowser={() => {
              throw new Error("Unexpected browser input")
            }}
          />
        </AnimationFrameProvider>
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  const bpmId = required(root, "transport-bpm").id
  const bpmBounds = bounds(root, "transport-bpm")
  const point = center(bpmBounds)
  const bpm = () => useProjectState.getState().document.transport.bpm
  assert(bpm() === 120, `Default BPM was ${bpm()}`)
  capture(root, "transport-bpm-default", transportViewport, ["transport-bpm", "transport-record"], {
    bpm: bpm(),
    interaction: "idle",
  })

  root.renderer.nativeSimulateMouseMove(point.x, point.y)
  capture(root, "transport-bpm-hover", transportViewport, ["transport-bpm"], {
    bpm: bpm(),
    pointer: point,
    interaction: "hover",
  })
  root.renderer.nativeSimulateMouseDown(point.x, point.y)
  capture(root, "transport-bpm-pressed", transportViewport, ["transport-bpm"], {
    bpm: bpm(),
    pointer: point,
    interaction: "mouse-down",
  })
  root.renderer.nativeSimulateMouseUp(point.x, point.y)
  assert(bpm() === 120, "BPM press changed its value")
  assert(
    root.renderer.findByTestId("transport-bpm-edit-indicator"),
    "BPM press did not enter pre-edit"
  )
  capture(
    root,
    "transport-bpm-pre-edit",
    transportViewport,
    ["transport-bpm", "transport-bpm-edit-indicator"],
    { bpm: bpm(), interaction: "pre-edit" }
  )

  root.renderer.focusElement(bpmId)
  assert(root.renderer.getFocusedElementId() === bpmId, "BPM did not receive focus")
  capture(root, "transport-bpm-focused", transportViewport, ["transport-bpm"], {
    bpm: bpm(),
    focusedElementId: root.renderer.getFocusedElementId(),
  })
  root.renderer.nativeSimulateKeystrokes(bpmId, "enter")
  const input = required(root, "transport-bpm-value")
  assert(input.type === "input", `BPM editing rendered ${input.type}`)
  assert(
    input.customProps?.value === "120.00",
    `Unexpected BPM draft ${String(input.customProps?.value)}`
  )
  capture(root, "transport-bpm-edit", transportViewport, ["transport-bpm", "transport-bpm-value"], {
    bpm: bpm(),
    draft: input.customProps.value,
    interaction: "editing",
  })
  root.renderer.nativeSimulateKeystrokes(input.id, "escape")
  assert(bpm() === 120, "Cancelling BPM editing changed its value")
  assert(
    root.renderer.findByTestId("transport-bpm-value")?.type === "text",
    "BPM editing did not end"
  )

  const recordPoint = click(root, "transport-record")
  assert(useProjectState.getState().session.recording, "Record control did not arm recording")
  capture(root, "transport-record-active", transportViewport, ["transport-record"], {
    recording: true,
    pointer: recordPoint,
  })
})

const browserViewport = { width: 600, height: 640 }
run("browser", browserViewport, root => {
  const frames = createTestAnimationFrames()
  root.render(
    <ThemeProvider>
      <AnimationFrameProvider source={frames}>
        <BrowserPanel labels={englishBrowserLabels} />
      </AnimationFrameProvider>
    </ThemeProvider>
  )
  const tuningId = "tunings-12-TET"
  const tuning = `browser-entry-${tuningId}`
  const favorite = `browser-favorite-${tuningId}`
  const initialBackground = required(root, tuning).style.backgroundColor
  const initialFavoriteOpacity = required(root, favorite).style.opacity
  const selectedPoint = click(root, tuning)
  const selectedBackground = required(root, tuning).style.backgroundColor
  assert(
    selectedBackground !== initialBackground,
    "Browser row selection did not change appearance"
  )
  capture(root, "browser-selected", browserViewport, ["browser-panel", "browser-results", tuning], {
    selected: tuningId,
    initialBackground,
    selectedBackground,
    pointer: selectedPoint,
  })

  const favoritePoint = click(root, favorite)
  assert(required(root, favorite).style.opacity === 1, "Favorite action did not become visible")
  assert(
    required(root, tuning).style.backgroundColor === selectedBackground,
    "Favorite action changed row selection"
  )
  capture(root, "browser-favorite", browserViewport, [tuning, favorite], {
    selected: tuningId,
    favorite: tuningId,
    initialFavoriteOpacity,
    pointer: favoritePoint,
  })

  const analogId = "browser-entry-instruments-analog"
  const analog = required(root, analogId)
  root.renderer.scrollIntoView(analog.id)
  root.renderer.flush()
  root.renderer.nativeSimulateKeystrokes(analog.id, "enter")
  const childId = "browser-entry-instruments-analog-1"
  const child = root.renderer.findByTestId(childId)
  assert(child, "Analog did not expand to show its preset")
  root.renderer.scrollIntoView(child.id)
  root.renderer.flush()
  capture(root, "browser-expanded", browserViewport, ["browser-results", analogId, childId], {
    selected: "instruments-analog",
    expanded: "instruments-analog",
    visibleChild: childId,
  })
})

const footerViewport = { width: 955, height: 300 }
run("footer", footerViewport, root => {
  const frames = createTestAnimationFrames()
  projectActions.addTrack("audio", DEFAULT_LAYOUT_TOKENS.track.defaultHeight)
  const track = useProjectState.getState().document.tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Authored audio track was not created")
  const device = createDevice("utility")
  projectActions.updateTrack(track.id, { devices: [device] })
  projectActions.selectTracks([track.id], "header")
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider value={{ inputPolicy: VERIFICATION_CONTROL_INPUT_POLICY }}>
        <AnimationFrameProvider source={frames}>
          <FooterHarness />
        </AnimationFrameProvider>
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  const cardId = `device-${device.id}`
  const storedDevice = () =>
    useProjectState
      .getState()
      .document.tracks.find(item => item.id === track.id)
      ?.devices?.find(item => item.id === device.id)
  assert(
    storedDevice()?.enabled && !storedDevice()?.collapsed,
    "Authored device did not start expanded and enabled"
  )
  capture(
    root,
    "footer-device-expanded",
    footerViewport,
    ["footer-content", cardId, `device-handle-${device.id}`],
    { trackId: track.id, deviceId: device.id, enabled: true, collapsed: false }
  )

  const card = required(root, cardId)
  const headerId = card.children[0]
  const header = headerId === undefined ? undefined : root.renderer.getElement(headerId)
  const toggleId = header?.children[0]
  if (toggleId === undefined) throw new Error("Missing device bypass button")
  const toggleBounds = root.renderer.getElementBounds(toggleId)
  if (!toggleBounds) throw new Error("Missing device bypass bounds")
  const togglePoint = center(toggleBounds)
  root.renderer.nativeSimulateClick(togglePoint.x, togglePoint.y)
  assert(storedDevice()?.enabled === false, "Device bypass did not update the project document")
  capture(root, "footer-device-bypassed", footerViewport, [cardId], {
    deviceId: device.id,
    enabled: false,
    collapsed: false,
    pointer: togglePoint,
  })

  root.renderer.nativeSimulateKeystrokes(required(root, `device-handle-${device.id}`).id, "enter")
  assert(storedDevice()?.collapsed === true, "Device handle Enter did not fold the card")
  capture(
    root,
    "footer-device-folded-bypassed",
    footerViewport,
    [cardId, `device-handle-${device.id}`],
    { deviceId: device.id, enabled: false, collapsed: true }
  )

  root.renderer.nativeSimulateKeystrokes(required(root, "motion-tab-clip").id, "enter")
  assert(
    root.renderer.getPaintedText().join(" ").includes(englishFooterLabels.noClip),
    "Empty Clip Edit message was not painted"
  )
  assert(
    !root.renderer.findByTestId("footer-divider"),
    "Clip Edit unexpectedly retained the device divider"
  )
  capture(root, "footer-clip-empty", footerViewport, ["footer-content", "motion-tab-clip"], {
    view: "clip",
    selectedClipIds: useProjectState.getState().session.selectedClipIds,
    emptyMessage: englishFooterLabels.noClip,
  })
})

const statusViewport = { width: 955, height: 64 }
run("status", statusViewport, root => {
  const frames = createTestAnimationFrames()
  const renderStatus = (
    info: "number" | null,
    warnings: readonly { message: string; severity: "warning" }[]
  ) => {
    root.render(
      <ThemeProvider>
        <AnimationFrameProvider source={frames}>
          <StatusStrip
            labels={englishStatusLabels}
            footerCollapsed={false}
            view="devices"
            info={info}
            warnings={warnings}
            onToggleFooter={() => {
              throw new Error("Unexpected footer toggle")
            }}
            onViewChange={() => {
              throw new Error("Unexpected view change")
            }}
          />
        </AnimationFrameProvider>
      </ThemeProvider>
    )
  }
  renderStatus("number", [])
  const help = englishStatusLabels.info.number
  assert(
    root.renderer.getPaintedText().join(" ").includes(help.description),
    "Status help was not painted"
  )
  capture(root, "status-help", statusViewport, ["status-info", "status-devices"], {
    info: "number",
    title: help.title,
    description: help.description,
  })
  const warning = { message: "Verification warning", severity: "warning" } as const
  renderStatus(null, [warning])
  assert(
    root.renderer.getPaintedText().join(" ").includes(warning.message),
    "Status warning was not painted"
  )
  capture(root, "status-warning", statusViewport, ["status-info", "status-devices"], { warning })
})

const manifest = { renderer: "createTestRoot-native-gpu", states, errors }
writeFileSync(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({ outputDirectory, states: states.length, errors }, null, 2)}\n`
)
if (errors.length) process.exitCode = 1
releaseCreation()
