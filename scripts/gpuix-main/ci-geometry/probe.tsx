import { createTestRoot } from "@gpuix/react/testing"
import { useWindowSize } from "@gpuix/react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import {
  hydrateProject,
  projectActions,
  useProjectState,
  readProjectTelemetry,
} from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { TransportBar } from "@/project/sections/transport"
import { englishTransportLabels } from "@/app/locales/sections/transport"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { createVerificationKeyboard } from "@/project/sections/footer/verification/keyboard"
import { createTestWindowActivity } from "@/project/sections/footer/verification/test-activity"
import { createTestAnimationFrames } from "@/project/sections/footer/verification/test-frame"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { TrackRows } from "@/project/sections/arrangement/tracks/TrackRows"
import { TrackResizeOverlay } from "@/project/sections/arrangement/tracks/TrackResizeOverlay"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { createControlledFrames } from "@/project/sections/arrangement/tracks/verification/frame-source"
import type { TestRoot } from "@gpuix/react/testing"
import { fontInventory } from "./font-inventory"

console.log(JSON.stringify(fontInventory()))
const passes = Number(process.env.PROBE_PASSES ?? "4")
if (!Number.isSafeInteger(passes) || passes < 1)
  throw new Error("PROBE_PASSES must be a positive integer")
const sans = process.env.PROBE_SANS
const design = {
  ...DEFAULT_DESIGN_TOKENS,
  typography: {
    ...DEFAULT_DESIGN_TOKENS.typography,
    numberFontFamily: process.env.PROBE_NUMBER ?? DEFAULT_DESIGN_TOKENS.typography.numberFontFamily,
  },
}
const rootStyle = {
  position: "relative" as const,
  width: "100%" as const,
  height: "100%" as const,
  display: "flex" as const,
  flexDirection: "column" as const,
  ...(sans ? { fontFamily: sans } : {}),
}
const frames = createControlledFrames()
const view = { width: 1000, height: 1600, pxPerBar: 32, scrollX: 0, scrollY: 0, dpr: 1 }

function Tracks() {
  const size = useWindowSize()
  const acceptedViewport = {
    ...view,
    width: Math.max(0, size.width - DEFAULT_LAYOUT_TOKENS.track.controlsWidth),
    height: size.height,
  }
  const document = useProjectState(state => state.document)
  const scene = {
    ...createSceneStore(DEFAULT_LAYOUT_TOKENS).get(),
    tracks: document.tracks,
    viewport: acceptedViewport,
  }
  return (
    <AnimationFrameProvider source={frames.source}>
      <ThemeProvider design={design}>
        <div style={rootStyle}>
          <TrackRows
            scene={scene}
            viewport={acceptedViewport}
            focusedTrackId={null}
            telemetry={readProjectTelemetry}
            labels={createTrackLabels("en-US")}
            onFocusTrack={id => projectActions.selectTracks([id], "header")}
            renderLane={row => <text>{row.track.name}</text>}
          />
          <TrackResizeOverlay
            scene={scene}
            viewport={acceptedViewport}
            labels={createTrackLabels("en-US")}
          />
        </div>
      </ThemeProvider>
    </AnimationFrameProvider>
  )
}

function bounds(root: TestRoot, testId: string) {
  const element = root.renderer.findByTestId(testId)
  const bounds = element ? root.renderer.getElementBounds(element.id) : null
  return {
    testId,
    bounds,
    style: element?.style,
    parentBounds:
      element?.parentId == null ? null : root.renderer.getElementBounds(element.parentId),
  }
}

function snapshot(root: TestRoot, surface: "header" | "sends", pass: number) {
  if (surface === "header") {
    const groups = [
      "transport-scroll",
      "transport-left",
      "transport-center",
      "transport-right",
    ].map(id => bounds(root, id))
    const center = groups[2].bounds
    console.log(
      JSON.stringify({
        surface,
        pass,
        sans: sans ?? "default",
        number: design.typography.numberFontFamily,
        groups,
        centerError: center ? center.x + center.width / 2 - 900 : null,
      })
    )
  } else {
    const groups = [
      "track-sends-3-audio",
      "track-send-a-apply-3-audio",
      "track-send-return-0-3-audio",
      "track-send-return-1-3-audio",
    ].map(id => bounds(root, id))
    const container = groups[0].bounds
    const columns = groups.slice(1).map(group => group.bounds)
    const widths = columns.map(column => column?.width ?? NaN)
    const ideal = ((container?.width ?? NaN) - DEFAULT_LAYOUT_TOKENS.track.spacing * 2) / 3
    console.log(
      JSON.stringify({
        surface,
        pass,
        sans: sans ?? "default",
        number: design.typography.numberFontFamily,
        groups,
        ideal,
        widthErrors: widths.map(width => width - ideal),
        sumError:
          widths.reduce((sum, width) => sum + width, DEFAULT_LAYOUT_TOKENS.track.spacing * 2) -
          (container?.width ?? NaN),
      })
    )
  }
}

hydrateProject(
  JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
)
const keyboard = createWindowKeyboard()
const header = createTestRoot({ width: 1800, height: 400, ...keyboard.rootHandlers })
const activity = createTestWindowActivity()
const animation = createTestAnimationFrames()
const owner = createVerificationKeyboard({
  windowKeyboard: keyboard,
  metrics: PROJECT_METRICS,
  size: { containerWidth: 1800, bodyHeight: 400, timelineLeft: 0 },
  subscribeWindowActive: activity.subscribe,
  blurControl: () => {
    const sink = header.renderer.findByTestId("keyboard-focus-surface")
    if (sink) header.renderer.focusElement(sink.id)
  },
})
try {
  header.render(
    <ThemeProvider design={design}>
      <WindowKeyboardProvider value={keyboard}>
        <AnimationFrameProvider source={animation}>
          <div testId="keyboard-focus-surface" tabIndex={-1} style={rootStyle}>
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
  header.renderer.dispatchNativeEvents()
  header.renderer.flush()
  for (let pass = 0; pass < passes; pass++) {
    if (pass > 0) {
      header.renderer.dispatchNativeEvents()
      header.renderer.flush()
    }
    snapshot(header, "header", pass)
  }
} finally {
  header.unmount()
  owner.dispose()
}

const document = createMockDocument()
for (const track of document.tracks) {
  track.collapsed = false
  track.heightPx = 70
  if (track.id === "3-audio") track.volumeDb = -12
}
const existingReturn = document.tracks.find(track => track.id === "a-apply")
if (!existingReturn) throw new Error("Missing return fixture")
for (let index = 0; index < 4; index++)
  document.tracks.push({ ...existingReturn, id: `return-${index}`, name: `Return ${index}` })
hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
const sends = createTestRoot({ width: view.width, height: view.height })
try {
  sends.render(<Tracks />)
  sends.renderer.flush()
  for (let pass = 0; pass < passes; pass++) {
    if (pass > 0) {
      sends.renderer.dispatchNativeEvents()
      sends.renderer.flush()
    }
    snapshot(sends, "sends", pass)
  }
  const firstY = bounds(sends, "track-send-a-apply-3-audio").bounds?.y
  const resize = sends.renderer.findByTestId("track-resize-3-audio")
  if (!resize) throw new Error("Missing resize fixture")
  const initiallyHidden = sends.renderer.findByTestId("track-send-return-2-3-audio") === undefined
  sends.renderer.nativeSimulateKeystrokes(resize.id, "down")
  const next = bounds(sends, "track-send-return-2-3-audio").bounds
  const first = bounds(sends, "track-send-a-apply-3-audio").bounds
  sends.renderer.simulateKeystrokes("up up")
  console.log(
    JSON.stringify({
      surface: "resize",
      sans: sans ?? "default",
      number: design.typography.numberFontFamily,
      initiallyHidden,
      firstY,
      next,
      first,
      deltaY: next && firstY !== undefined ? next.y - firstY : null,
      finalSendHidden: sends.renderer.findByTestId("track-send-a-apply-3-audio") === undefined,
    })
  )
} finally {
  sends.unmount()
}
