import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { hydrateProject, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createSceneStore } from "../core/scene"
import { layoutTrackRows } from "../core/layout"
import { TrackRows } from "./TrackRows"
import { TrackRow } from "./Row"
import { TrackResizeOverlay } from "./TrackResizeOverlay"
import { TrackLabelsProvider } from "./labels"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { createControlledFrames } from "./verification/frame-source"
import { TrackTelemetryProvider } from "./meter/telemetry"
import type { DesignTokens } from "@/shared/theme/design-tokens"

test("native track consumers honor design overrides and shared arrangement geometry", () => {
  const document = createMockDocument()
  const group = document.tracks.find(track => track.kind === "group")
  const main = document.tracks.find(track => track.kind === "main")
  if (!group || !main) throw new Error("Missing group/Main fixture")
  group.collapsed = true
  document.tracks = [
    group,
    ...document.tracks.filter(track => group.childTrackIds?.includes(track.id)),
    main,
  ]
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  const layout = {
    ...DEFAULT_LAYOUT_TOKENS,
    arrangement: {
      ...DEFAULT_LAYOUT_TOKENS.arrangement,
      markerRulerHeight: 22,
      loopRulerHeight: 21,
      barRulerHeight: 43,
      timeRulerHeight: 27,
    },
  }
  const design = {
    ...DEFAULT_DESIGN_TOKENS,
    shape: { ...DEFAULT_DESIGN_TOKENS.shape, controlBorderWidth: 3, focusRingWidth: 2 },
    editor: { ...DEFAULT_DESIGN_TOKENS.editor, dividerStrokeWidth: 2, insertionLineWidth: 4 },
    typography: {
      ...DEFAULT_DESIGN_TOKENS.typography,
      weights: { ...DEFAULT_DESIGN_TOKENS.typography.weights, medium: 600 },
    },
    cursors: {
      ...DEFAULT_DESIGN_TOKENS.cursors,
      verticalResize: "crosshair",
      grab: "pointer",
      grabbing: "move",
      default: "text",
    },
  } satisfies DesignTokens
  const scene = createSceneStore(layout)
  scene.setMusic({
    bars: 128,
    grid: { mode: "fixed", bars: 0.25 },
    transport: document.transport,
    markers: document.markers,
    tracks: useProjectState.getState().document.tracks,
    loop: document.transport.loop,
  })
  scene.setViewport({ width: 800, height: 500, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
  const root = createTestRoot({ width: 1104, height: 500 })
  const labels = createTrackLabels("en-US")
  try {
    root.render(
      <AnimationFrameProvider source={createControlledFrames().source}>
        <ThemeProvider design={design} layout={layout}>
          <div style={{ position: "relative", width: 1104, height: 500 }}>
            <TrackRows
              scene={scene.get()}
              viewport={scene.get().viewport}
              focusedTrackId={null}
              onFocusTrack={() => {}}
              telemetry={() => null}
              renderLane={() => null}
              labels={labels}
            />
            <TrackResizeOverlay
              scene={scene.get()}
              viewport={scene.get().viewport}
              labels={labels}
            />
          </div>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
    const node = (id: string) => {
      const found = root.renderer.findByTestId(id)
      if (!found)
        throw new Error(
          `Missing ${id}; rows=${JSON.stringify(layoutTrackRows(scene.get()).map(row => ({ id: row.track.id, kind: row.track.kind, top: row.top, height: row.height })))}`
        )
      return found
    }
    const bounds = (id: string) => {
      const nativeId = node(id).id
      const measured = root.renderer.getElementBounds(nativeId)
      if (!measured) throw new Error(`Missing native bounds for ${id}`)
      return measured
    }
    expect(node(`track-group-frame-${group.id}`).style.borderWidth).toBe(3)
    const rail = node(`track-rail-${group.id}-${group.id}`)
    expect(rail.style.borderLeftWidth).toBe(2)
    expect(rail.style.borderRightWidth).toBe(2)
    expect(rail.style.borderTopWidth).toBe(2)
    expect(rail.style.borderBottomWidth).toBe(2)
    expect(node(`track-name-${group.id}`).style.fontWeight).toBe(600)
    expect(node(`track-label-${group.id}`).style.cursor).toBe("pointer")
    expect(node(`track-label-${main.id}`).style.cursor).toBe("text")
    expect(node(`track-resize-${group.id}`).style.cursor).toBe("crosshair")
    for (const id of [
      `track-row-${group.id}`,
      `track-identity-${group.id}`,
      `track-resize-${group.id}`,
    ]) {
      expect(node(id).style.focusVisible).toMatchObject({ outlineWidth: 2, outlineOffset: -2 })
    }
    const scrollable = bounds("track-scrollable-viewport")
    expect(scrollable.y).toBe(43)
    expect(bounds(`track-row-${group.id}`).y).toBe(43)
    const pinned = bounds("track-pinned-viewport")
    expect(pinned.y + pinned.height).toBe(473)
    const mainBounds = bounds(`track-row-${main.id}`)
    expect(mainBounds.y + mainBounds.height).toBe(473)
    const row = layoutTrackRows(scene.get()).find(item => item.track.id === group.id)
    if (!row) throw new Error("Missing group row")
    root.render(
      <AnimationFrameProvider source={createControlledFrames().source}>
        <ThemeProvider design={design} layout={layout}>
          <TrackLabelsProvider labels={labels}>
            <TrackTelemetryProvider telemetry={() => null}>
              <TrackRow
                row={row}
                rails={[]}
                lane={null}
                showLane
                onFocusTrack={() => {}}
                dragging
                dropTarget
              />
            </TrackTelemetryProvider>
          </TrackLabelsProvider>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
    expect(node(`track-label-${group.id}`).style.cursor).toBe("move")
    expect(bounds(`track-drop-target-${group.id}`).height).toBe(4)
  } finally {
    root.unmount()
  }
})
