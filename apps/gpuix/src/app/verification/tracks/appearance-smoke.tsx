import { VERIFICATION_CONTROL_INPUT_POLICY } from "@/app/control-input"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import {
  hydrateProject,
  configureProjectCreation,
  projectActions,
  readProjectTelemetry,
} from "@/project/adapters"
import { createTrack } from "@/project/model/reducers"
import {
  createTestDocument,
  createTestWorkspace,
  TEST_CREATION,
  TEST_PROJECT_CREATION,
  TEST_TRACK_APPEARANCE,
} from "@/project/adapters/fixtures"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackRows } from "@/project/sections/arrangement/tracks/TrackRows"
import { TrackResizeOverlay } from "@/project/sections/arrangement/tracks/TrackResizeOverlay"
import { createControlledFrames } from "@/project/sections/arrangement/tracks/verification/frame-source"
import { trackResources } from "@/project/sections/arrangement/tracks/locales"

const directory =
  process.env.TRACKS_EVIDENCE_DIR ?? mkdtempSync(path.join(tmpdir(), "zoeydaw-tracks-"))
mkdirSync(directory, { recursive: true })
configureProjectCreation(TEST_PROJECT_CREATION)
const document = createTestDocument()
const workspace = createTestWorkspace()
for (const kind of ["audio", "midi", "group", "return"] as const) {
  const track = createTrack(kind, document.tracks, undefined, {
    ...TEST_CREATION,
    appearance: { ...TEST_TRACK_APPEARANCE, heightPx: DEFAULT_LAYOUT_TOKENS.track.defaultHeight },
  })
  track.name = `${kind} 音轨`
  document.tracks.splice(document.tracks.length - 1, 0, track)
}
hydrateProject(JSON.stringify({ version: 2, document, workspace }))
const viewport = { width: 760, height: 720, pxPerBar: 32, scrollX: 0, scrollY: 0, dpr: 1 }
const scene = createSceneStore(DEFAULT_LAYOUT_TOKENS)
scene.setMusic({
  tracks: document.tracks,
  bars: 128,
  grid: workspace.grid,
  markers: [],
  loop: document.transport.loop,
  transport: document.transport,
})
scene.setViewport(viewport)
const bounds = []
for (const appearance of ["dark", "light"] as const) {
  for (const language of ["en-US", "zh-CN"] as const) {
    const frames = createControlledFrames()
    const root = createTestRoot({
      width: viewport.width + DEFAULT_LAYOUT_TOKENS.track.controlsWidth,
      height: viewport.height,
    })
    try {
      root.render(
        <AnimationFrameProvider source={frames.source}>
          <ThemeProvider defaultAppearance={appearance}>
            <ControlEnvironmentProvider value={{ inputPolicy: VERIFICATION_CONTROL_INPUT_POLICY }}>
              <div style={{ position: "relative", width: "100%", height: "100%" }}>
                <TrackRows
                  scene={scene.get()}
                  viewport={viewport}
                  focusedTrackId={null}
                  onFocusTrack={id => projectActions.selectTracks([id], "header")}
                  telemetry={readProjectTelemetry}
                  labels={trackResources[language].arrangement}
                  renderLane={row => <text>{row.track.name}</text>}
                />
                <TrackResizeOverlay
                  scene={scene.get()}
                  viewport={viewport}
                  labels={trackResources[language].arrangement}
                />
              </div>
            </ControlEnvironmentProvider>
          </ThemeProvider>
        </AnimationFrameProvider>
      )
      root.renderer.flush()
      root.renderer.captureScreenshot(`${directory}/${appearance}-${language}.png`)
      const controls = root.renderer
        .findByType("div")
        .filter(node => node.testId?.startsWith("track-"))
      bounds.push({
        appearance,
        language,
        controls: controls.map(node => ({
          id: node.testId,
          bounds: root.renderer.getElementBounds(node.id),
        })),
      })
    } finally {
      root.unmount()
    }
    if (root.renderer.getRetainedElementCount() !== 0) throw new Error("Track evidence tree leaked")
  }
}
await Bun.write(`${directory}/bounds.json`, JSON.stringify(bounds, null, 2))
process.stdout.write(`${directory}: four composite captures; all retained trees released\n`)
