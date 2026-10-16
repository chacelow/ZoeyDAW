import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { AnimationFrameProvider } from "@/platform/frame"
import { createWindowKeyboard, WindowKeyboardProvider } from "@/platform/keyboard"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createSceneStore } from "../core/scene"
import { createTimelineController } from "./controller"
import { englishLabels } from "@/app/locales/sections/timeline"
import { ArrangementTimeline } from "./ArrangementTimeline"
import { Rulers, TimeRuler } from "./rulers"
import { MiniMap } from "./minimap"
import type { ReactNode } from "react"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import type { CursorLockPort } from "@/ui/controls"
import { createDisplayFormats } from "@/app/i18n/display-formats"
import { displayConfigByLocale } from "@/app/locales/display"

const layout = {
  ...DEFAULT_LAYOUT_TOKENS,
  arrangement: {
    ...DEFAULT_LAYOUT_TOKENS.arrangement,
    markerRulerHeight: 22,
    loopRulerHeight: 21,
    barRulerHeight: 43,
    timeRulerHeight: 27,
    minimapClipInset: 5,
  },
}
const design = {
  ...DEFAULT_DESIGN_TOKENS,
  shape: { ...DEFAULT_DESIGN_TOKENS.shape, focusRingWidth: 3, controlBorderWidth: 6 },
  spacing: { ...DEFAULT_DESIGN_TOKENS.spacing, stackGap: 9 },
  editor: {
    ...DEFAULT_DESIGN_TOKENS.editor,
    dividerStrokeWidth: 2,
    markerLineWidth: 3,
    loopStrokeWidth: 4,
    playheadLineWidth: 5,
  },
  cursors: {
    ...DEFAULT_DESIGN_TOKENS.cursors,
    default: "text",
    grab: "pointer",
    grabbing: "move",
    horizontalResize: "crosshair",
  },
} satisfies DesignTokens
const cursor: CursorLockPort = { capture: point => point, hide() {}, restore() {} }

function setup() {
  const document = createMockDocument()
  document.transport.loop = { ...document.transport.loop, enabled: true, startBar: 2, endBar: 5 }
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  const scene = createSceneStore(layout)
  const owner = createTimelineController({
    sceneStore: scene,
    initialSize: { containerWidth: 1104, bodyHeight: 320, timelineLeft: 0 },
    metrics: { minimapMinHeight: 32, minimapMaxHeight: 90, timelineAutoScrollEdge: 42 },
    keyboard: { focus: () => "timeline", blurControl: () => {} },
    subscribeWindowActive: () => () => {},
  })
  const root = createTestRoot({ width: 1104, height: 500 })
  const render = (content: ReactNode) =>
    root.render(
      <ThemeProvider design={design} layout={layout}>
        {content}
      </ThemeProvider>
    )
  const node = (id: string) => {
    const found = root.renderer.findByTestId(id)
    if (!found) throw new Error(`Missing ${id}`)
    return found
  }
  const bounds = (id: string) => {
    const nativeId = node(id).id
    const measured = root.renderer.getElementBounds(nativeId)
    if (!measured) throw new Error(`Missing native bounds for ${id}`)
    return measured
  }
  return { owner, scene, root, render, node, bounds }
}

test("native rulers and minimap consume injected strokes, geometry and semantic cursors", () => {
  const { owner, scene, root, render, node, bounds } = setup()
  try {
    render(<Rulers owner={owner} labels={englishLabels} />)
    expect(bounds("timeline-rulers").height).toBe(43)
    expect(node("timeline-rulers").style.borderBottomWidth).toBe(2)
    expect(node("timeline-rulers").style.cursor).toBe("text")
    const marker = node("ruler-marker-intro")
    expect(marker.style.height).toBe(22)
    expect(marker.style.borderLeftWidth).toBe(3)
    expect(marker.style.paddingLeft).toBe(4)
    const loop = node("ruler-loop")
    expect(loop.style.top).toBe(22)
    expect(loop.style.height).toBe(21)
    expect(loop.style.borderLeftWidth).toBe(4)
    expect(loop.style.borderRightWidth).toBe(4)
    root.renderer.nativeSimulateMouseMove(2, 8)
    root.renderer.flush()
    expect(node("timeline-rulers").style.cursor).toBe("pointer")
    root.renderer.nativeSimulateMouseDown(2, 8)
    root.renderer.nativeSimulateMouseMove(3, 8, 0)
    root.renderer.flush()
    expect(node("timeline-rulers").style.cursor).toBe("move")
    root.renderer.nativeSimulateMouseUp(3, 8)
    const loopStart = (scene.get().loop.startBar - 1) * scene.get().viewport.pxPerBar
    root.renderer.nativeSimulateMouseMove(loopStart, 24)
    root.renderer.flush()
    expect(node("timeline-rulers").style.cursor).toBe("crosshair")
    flushSync(() => scene.setTargetSelection({ kind: "marker", id: "intro", phase: "renaming" }))
    root.renderer.flush()
    expect(node("marker-name-editor").style.top).toBe(20)

    render(
      <TimeRuler formats={englishLabels.formats} scene={scene} label={englishLabels.timeRuler} />
    )
    expect(bounds("timeline-time-ruler").height).toBe(27)
    expect(node("timeline-time-ruler").style.borderTopWidth).toBe(2)
    expect(node("time-ruler-label-0").style.height).toBe(27)
    expect(node("time-ruler-label-0").style.paddingLeft).toBe(9)
    expect(bounds("time-ruler-tick-0").width).toBe(3)

    render(
      <MiniMap
        geometry={owner.view.overviewGeometry()}
        width={800}
        height={80}
        label={englishLabels.minimap}
        cursor={cursor}
        onNavigate={() => {}}
        onViewport={() => {}}
        onFit={() => {}}
      />
    )
    expect(node("timeline-minimap").style.cursor).toBe("pointer")
    expect(node("minimap-track-drums-group").style.borderBottomWidth).toBe(2)
    expect(bounds("minimap-marker-intro").width).toBe(3)
    expect(bounds("minimap-playhead").width).toBe(5)
    const clipTrack = useProjectState.getState().document.tracks.find(track => track.clips.length)
    const clip = clipTrack?.clips[0]
    if (!clipTrack || !clip) throw new Error("Missing minimap clip fixture")
    const trackBounds = bounds(`minimap-track-${clipTrack.id}`)
    expect(node(`minimap-clip-${clip.id}`).style.height).toBe(trackBounds.height - 5)
    const frame = bounds("minimap-frame")
    expect(node("minimap-frame").style.borderWidth).toBe(6)
    root.renderer.nativeSimulateMouseMove(frame.x + frame.width, 40)
    root.renderer.flush()
    expect(node("timeline-minimap").style.cursor).toBe("crosshair")
  } finally {
    root.unmount()
    owner.dispose()
  }
})

test("native timeline composition aligns editable body and footer with injected ruler geometry", async () => {
  const { owner, scene, root, render, node } = setup()
  try {
    render(
      <AnimationFrameProvider
        source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}
      >
        <WindowKeyboardProvider value={createWindowKeyboard()}>
          <ArrangementTimeline
            controller={owner}
            tracks={null}
            overlay={null}
            labels={englishLabels}
            cursor={cursor}
          />
        </WindowKeyboardProvider>
      </AnimationFrameProvider>
    )
    // Native layout events update the shared viewport after the initial React commit.
    for (let frame = 0; frame < 4; frame++) {
      await Bun.sleep(20)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const input = node("timeline-viewport")
    expect(input.style.top).toBe(43)
    expect(input.style.height).toBe(Math.max(0, scene.get().viewport.height - 43 - 27))
    expect(input.style.focusVisible).toMatchObject({ outlineWidth: 3, outlineOffset: -3 })
    expect(node("timeline-grid").style.height).toBe(input.style.height)
    expect(node("timeline-time-ruler").style.height).toBe(27)
  } finally {
    root.unmount()
    owner.dispose()
  }
})

test("native time ruler and zoom density consume their injected display precision", () => {
  const { owner, scene, root, render, node } = setup()
  const config = structuredClone(displayConfigByLocale["en-US"])
  config.duration.rulerDigits = 1
  config.duration.rulerOmitZeroFraction = false
  config.precision.integer = 1
  const labels = { ...englishLabels, formats: createDisplayFormats("en-US", config) }
  try {
    render(<TimeRuler scene={scene} label={labels.timeRuler} formats={labels.formats} />)
    const text = node("time-ruler-label-0")
      .children.map(id => root.renderer.getElement(id)?.text ?? "")
      .join("")
    expect(text).toBe("0:00.0")
    projectActions.setViewport({ pxPerBar: 33.5 })
    render(
      <AnimationFrameProvider
        source={{ subscribe: () => () => {}, subscribeResume: () => () => {} }}
      >
        <WindowKeyboardProvider value={createWindowKeyboard()}>
          <ArrangementTimeline
            controller={owner}
            tracks={null}
            overlay={null}
            labels={labels}
            cursor={cursor}
          />
        </WindowKeyboardProvider>
      </AnimationFrameProvider>
    )
    expect(root.renderer.findByText(`33.5 ${labels.pixelsPerBar}`)).toBeDefined()
  } finally {
    root.unmount()
    owner.dispose()
  }
})
