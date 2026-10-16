import { appendFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  configureProjectBackend,
  readProjectPeaks,
  readProjectTelemetry,
  useProjectState,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createTrack } from "@/project/model/reducers"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"

const evidence = process.env.B2_EVIDENCE_DIR
if (!evidence) throw new Error("B2_EVIDENCE_DIR must point to a temporary fixture directory")
const samplePath = path.resolve(
  import.meta.dir,
  "../../../../../crates/engine/spikes/assets/probe.wav"
)
configureProjectBackend(createNativeBackend, {
  createProject() {
    const { document: current, workspace } = useProjectState.getState()
    const document = structuredClone(current)
    const main = document.tracks.find(track => track.kind === "main")
    if (!main) throw new Error("Missing Main output")
    const audio = createTrack(
      "audio",
      [main],
      undefined,
      DEFAULT_LAYOUT_TOKENS.track.defaultHeight * 2
    )
    audio.id = "native-audio"
    audio.name = "Native audio fixture"
    audio.clips = [
      {
        id: "native-audio-clip",
        kind: "audio",
        label: "Real source",
        startBar: 1,
        lengthBars: 4,
        samplePath,
        gainDb: 0,
      },
    ]
    const midi = createTrack(
      "midi",
      [audio, main],
      undefined,
      DEFAULT_LAYOUT_TOKENS.track.defaultHeight * 2
    )
    midi.id = "native-midi"
    midi.name = "MIDI fixture"
    midi.clips = [
      {
        id: "native-midi-clip",
        kind: "midi",
        label: "MIDI editor",
        startBar: 2,
        lengthBars: 2,
        notes: [{ pitch: 60, startBeat: 0, lengthBeats: 1, velocity: 90 }],
      },
    ]
    document.name = "B2 native fixture"
    document.tracks = [audio, midi, main]
    return {
      document,
      workspace: {
        ...structuredClone(workspace),
        scrollX: 0,
        scrollY: 0,
        pxPerBar: 64,
        drawMode: false,
        automationMode: false,
        computerKeyboard: false,
      },
    }
  },
})
const observations = { last: "", native: false }
useProjectState.subscribe(state => {
  const next = JSON.stringify({
    backend: state.session.backend.phase,
    playing: state.session.playing,
    automation: state.workspace.automationMode,
    draw: state.workspace.drawMode,
    drawOverride: state.session.drawModeOverride,
    keyboard: state.workspace.computerKeyboard,
    editing: state.session.editingClipId,
    clipRequest: state.session.clipEditorRequest,
    selected: state.session.selectedClipIds,
  })
  if (next !== observations.last) {
    observations.last = next
    appendFileSync(path.join(evidence, "native-events.jsonl"), `${next}\n`)
  }
  if (observations.native) return
  const telemetry = readProjectTelemetry()
  if (!telemetry || state.session.backend.phase !== "ready") return
  const peaks = readProjectPeaks(samplePath, 1, 1.05, 64, 0)
  if (peaks.length !== 256) return
  observations.native = true
  writeFileSync(
    path.join(evidence, "native-backend.json"),
    JSON.stringify(
      {
        telemetry,
        peakLayout: "channel-major min/max",
        peakValues: peaks.length,
        minimum: Math.min(...peaks),
        maximum: Math.max(...peaks),
      },
      null,
      2
    )
  )
})
