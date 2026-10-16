import { VERIFICATION_CONTROL_INPUT_POLICY } from "@/app/control-input"
import { ControlEnvironmentProvider } from "@/ui/controls"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import {
  hydrateProject,
  configureProjectCreation,
  projectActions,
  readProjectTelemetry,
} from "@/project/adapters"
import { createTrack } from "@/project/model/reducers"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import {
  createTestDocument,
  createTestWorkspace,
  TEST_CREATION,
  TEST_PROJECT_CREATION,
  TEST_TRACK_APPEARANCE,
} from "@/project/adapters/fixtures"
import { createSceneStore } from "@/project/sections/arrangement/core/scene"
import { TrackRows } from "@/project/sections/arrangement/tracks/TrackRows"
import { TrackResizeOverlay } from "@/project/sections/arrangement/tracks/TrackResizeOverlay"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { AnimationFrameProvider } from "@/platform/frame"
import { createControlledFrames } from "@/project/sections/arrangement/tracks/verification/frame-source"

configureProjectCreation(TEST_PROJECT_CREATION)
const baseline = createTestDocument()
const workspace = createTestWorkspace()
const main = baseline.tracks.find(track => track.kind === "main")
if (!main) throw new Error("Missing Main output")
const results = []
for (const sourceCount of [20, 2000]) {
  const controlledFrames = createControlledFrames()
  const document = structuredClone(baseline)
  document.tracks = []
  for (let index = 0; index < sourceCount; index++) {
    const track = createTrack("audio", document.tracks, undefined, {
      ...TEST_CREATION,
      appearance: { ...TEST_TRACK_APPEARANCE, heightPx: DEFAULT_LAYOUT_TOKENS.track.defaultHeight },
    })
    track.id = `perf-${index}`
    track.name = `Track ${index}`
    document.tracks.push(track)
  }
  document.tracks.push(structuredClone(main))
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
  const viewport = { width: 1000, height: 500, pxPerBar: 32, scrollX: 0, scrollY: 700, dpr: 1 }
  const store = createSceneStore(DEFAULT_LAYOUT_TOKENS)
  store.setMusic({
    tracks: document.tracks,
    bars: 128,
    grid: workspace.grid,
    markers: [],
    loop: document.transport.loop,
    transport: document.transport,
  })
  store.setViewport(viewport)
  const root = createTestRoot({
    width: viewport.width + DEFAULT_LAYOUT_TOKENS.track.controlsWidth,
    height: viewport.height,
  })
  try {
    root.render(
      <AnimationFrameProvider source={controlledFrames.source}>
        <ThemeProvider>
          <ControlEnvironmentProvider value={{ inputPolicy: VERIFICATION_CONTROL_INPUT_POLICY }}>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <TrackRows
                scene={store.get()}
                viewport={viewport}
                focusedTrackId={null}
                onFocusTrack={id => projectActions.selectTracks([id], "header")}
                telemetry={readProjectTelemetry}
                labels={createTrackLabels("en-US")}
                renderLane={row => (
                  <text testId={`profile-lane-${row.track.id}`}>{row.track.name}</text>
                )}
              />
              <TrackResizeOverlay
                scene={store.get()}
                viewport={viewport}
                labels={createTrackLabels("en-US")}
              />
            </div>
          </ControlEnvironmentProvider>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
    root.renderer.flush()
    const mountedRows = root.renderer
      .findByType("div")
      .filter(node => node.testId?.startsWith("track-row-")).length
    const mountedLanes = root.renderer
      .findByType("text")
      .filter(node => node.testId?.startsWith("profile-lane-")).length
    const retained = root.renderer.getRetainedElementCount()
    root.renderer.resetDebugFrameOverlayStats()
    const before = root.renderer.getDebugFrameOverlayStats().frames ?? 0
    for (let frame = 0; frame < 30; frame++) {
      controlledFrames.advance(performance.now())
      root.renderer.flush()
    }
    const stats = root.renderer.getDebugFrameOverlayStats()
    results.push({
      sourceCount,
      mountedRows,
      mountedLanes,
      retained,
      frames: (stats.frames ?? 0) - before,
      p90Ms: stats.p90Ms,
      p99Ms: stats.p99Ms,
      maxMs: stats.maxMs,
    })
  } finally {
    root.unmount()
  }
  if (root.renderer.getRetainedElementCount() !== 0)
    throw new Error("Track tree leaked after unmount")
}
if (results[0]?.retained !== results[1]?.retained)
  throw new Error("Offscreen source tracks changed retained node count")
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
