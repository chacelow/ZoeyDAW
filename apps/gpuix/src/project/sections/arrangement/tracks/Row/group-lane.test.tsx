import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import { hydrateProject, useProjectState } from "@/project/adapters"
import {
  createMockDocument,
  createMockWorkspace,
  TEST_CREATION_NAMES,
} from "@/project/adapters/fixtures"
import { createSceneStore } from "../../core/scene"
import { LaneContents } from "../../lane/LaneRow/Contents"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackRows } from "../TrackRows"
import { TrackResizeOverlay } from "../TrackResizeOverlay"
import { createTrackLabels } from "@/app/locales/sections/tracks"
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
    const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
    scene.setMusic({
      bars: 128,
      grid: { mode: "fixed", bars: 0.25 },
      transport: document.transport,
      markers: [],
      tracks: useProjectState.getState().document.tracks,
      loop: document.transport.loop,
    })
    scene.setViewport({ width, height: 500, pxPerBar: 100, scrollX: 0, scrollY: 0, dpr: 1 })
    const root = createTestRoot({
      width: width + DEFAULT_LAYOUT_TOKENS.track.controlsWidth,
      height: 500,
    })
    try {
      root.render(
        <AnimationFrameProvider source={createControlledFrames().source}>
          <ThemeProvider>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <TrackRows
                scene={scene.get()}
                viewport={scene.get().viewport}
                focusedTrackId={null}
                onFocusTrack={() => {}}
                telemetry={() => null}
                labels={createTrackLabels("en-US")}
                renderLane={row => (
                  <LaneContents
                    creationNames={TEST_CREATION_NAMES}
                    row={row}
                    scene={scene.get()}
                    automationMode={false}
                    readPeaks={() => new Float32Array(0)}
                  />
                )}
              />
              <TrackResizeOverlay
                scene={scene.get()}
                viewport={scene.get().viewport}
                labels={createTrackLabels("en-US")}
              />
            </div>
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
