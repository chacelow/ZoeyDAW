import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider } from "@/platform/frame"
import {
  hydrateProject,
  projectActions,
  readProjectTelemetry,
  useProjectState,
} from "@/project/adapters"
import { createTrack } from "@/project/model/reducers"
import { CONTROLS_WIDTH, DEFAULT_TRACK_HEIGHT } from "@/project/layout"
import { createSceneStore } from "../../core/scene"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackRows } from "../TrackRows"
import { trackResources } from "../locales"
import { createControlledFrames } from "./frame-source"

const directory =
  process.env.TRACKS_EVIDENCE_DIR ?? mkdtempSync(path.join(tmpdir(), "zoeydaw-tracks-"))
mkdirSync(directory, { recursive: true })
const document = structuredClone(useProjectState.getState().document)
const workspace = structuredClone(useProjectState.getState().workspace)
for (const kind of ["audio", "midi", "group", "return"] as const) {
  const track = createTrack(kind, document.tracks, undefined, DEFAULT_TRACK_HEIGHT)
  track.name = `${kind} 音轨`
  document.tracks.splice(document.tracks.length - 1, 0, track)
}
hydrateProject(JSON.stringify({ version: 2, document, workspace }))
const viewport = { width: 760, height: 720, pxPerBar: 32, scrollX: 0, scrollY: 0, dpr: 1 }
const scene = createSceneStore()
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
    const root = createTestRoot({ width: viewport.width + CONTROLS_WIDTH, height: viewport.height })
    try {
      root.render(
        <AnimationFrameProvider source={frames.source}>
          <ThemeProvider defaultAppearance={appearance}>
            <TrackRows
              scene={scene.get()}
              viewport={viewport}
              focusedTrackId={null}
              onFocusTrack={id => projectActions.selectTracks([id], "header")}
              telemetry={readProjectTelemetry}
              labels={trackResources[language].arrangement}
              renderLane={row => <text>{row.track.name}</text>}
            />
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
