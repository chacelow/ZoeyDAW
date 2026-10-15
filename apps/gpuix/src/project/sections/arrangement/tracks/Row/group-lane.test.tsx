import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { hydrateProject, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { CONTROLS_WIDTH } from "@/project/layout"
import { createSceneStore } from "../../core/scene"
import { LaneContents } from "../../lane/LaneRow/Contents"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackRows } from "../TrackRows"
import { trackResources } from "../locales"
import { createControlledFrames } from "../verification/frame-source"

for (const width of [800, 200]) {
  test(`collapsed group retains lane summary at the right edge of a ${width}px time viewport`, () => {
    const document = createMockDocument()
    const group = document.tracks.find(track => track.kind === "group")
    const child = document.tracks.find(track => track.kind === "midi")
    if (!group || !child) throw new Error("Missing group fixture")
    group.collapsed = true
    child.clips = [
      {
        kind: "pattern",
        id: "edge",
        patternId: "p",
        startBar: 1 + (width - 20) / 100,
        lengthBars: 1,
        steps: [true],
      },
    ]
    hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
    const scene = createSceneStore()
    scene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 0.25 },
      transport: document.transport,
      markers: [],
      tracks: useProjectState.getState().document.tracks,
      loop: document.transport.loop,
    })
    scene.setViewport({ width, height: 500, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
    const root = createTestRoot({ width: width + CONTROLS_WIDTH, height: 500 })
    try {
      root.render(
        <AnimationFrameProvider source={createControlledFrames().source}>
          <ThemeProvider>
            <TrackRows
              scene={scene.get()}
              viewport={scene.get().viewport}
              focusedTrackId={null}
              onFocusTrack={() => {}}
              telemetry={() => null}
              labels={trackResources["en-US"].arrangement}
              renderLane={row => (
                <LaneContents
                  row={row}
                  scene={scene.get()}
                  automationMode={false}
                  readPeaks={() => new Float32Array(0)}
                  onActivate={() => {}}
                />
              )}
            />
          </ThemeProvider>
        </AnimationFrameProvider>
      )
      const summary = root.renderer.findByTestId(`group-clip-${child.id}-source-edge`)
      expect(summary).toBeDefined()
      if (!summary) throw new Error("Collapsed group bypassed lane summary")
      expect(root.renderer.getElementBounds(summary.id)).toMatchObject({ x: width - 20, width: 20 })
      expect(root.renderer.findByTestId(`lane-row-content-${group.id}`)).toBeDefined()
    } finally {
      root.unmount()
    }
  })
}
