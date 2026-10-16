import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { displayConfigByLocale } from "@/app/locales/display"
import { createDisplayFormats } from "@/app/i18n/display-formats"
import { hydrateProject, useProjectState } from "@/project/adapters"
import { useProjectState as projectStore } from "@/project/stores/useProjectState"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { AnimationFrameProvider } from "@/platform/frame"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TrackLabelsProvider } from "./labels"
import { TrackMixer } from "./TrackMixer"
import { TrackRouting } from "./TrackRouting"
import { createControlledFrames } from "./verification/frame-source"
import { TrackTelemetryProvider } from "./meter/telemetry"

test("native mixer display, parsing and monitor labels follow their injected sources", () => {
  const saved = useProjectState.getState()
  const document = createMockDocument()
  const audio = document.tracks.find(track => track.kind === "audio")
  const main = document.tracks.find(track => track.kind === "main")
  if (!audio || !main) throw new Error("Missing native formatting fixture")
  audio.collapsed = false
  audio.heightPx = 160
  audio.volumeDb = -12.5
  audio.pan = 0
  document.tracks = [audio, main]
  const snapshot = JSON.stringify({ version: 2, document, workspace: createMockWorkspace() })
  hydrateProject(snapshot)
  const config = structuredClone(displayConfigByLocale["en-US"])
  config.precision.db = 2
  config.pan = { ...config.pan, center: "MID", left: "W", right: "E" }
  config.widthSamples.pan = ["MID", "W100", "E100"]
  const labels = {
    ...createTrackLabels("en-US"),
    monitorOff: "MODE-OFF",
    formats: createDisplayFormats("en-US", config),
  }
  const root = createTestRoot({ width: 304, height: 200 })
  function Surface() {
    const track = useProjectState(state =>
      state.document.tracks.find(item => item.id === audio?.id)
    )
    if (!track) throw new Error("Formatting track disappeared")
    return (
      <div style={{ display: "flex", width: 304, height: 200 }}>
        <TrackRouting track={track} />
        <TrackMixer track={track} />
      </div>
    )
  }
  const valueText = (id: string) => {
    const value = root.renderer.findByTestId(`${id}-value`)
    if (!value) throw new Error(`Missing visible value for ${id}`)
    return (
      value.text ??
      value.children.map(child => root.renderer.getElement(child)?.text ?? "").join("")
    )
  }
  try {
    root.render(
      <AnimationFrameProvider source={createControlledFrames().source}>
        <ThemeProvider>
          <TrackLabelsProvider labels={labels}>
            <TrackTelemetryProvider telemetry={() => null}>
              <Surface />
            </TrackTelemetryProvider>
          </TrackLabelsProvider>
        </ThemeProvider>
      </AnimationFrameProvider>
    )
    expect(valueText(`track-pan-${audio.id}`)).toBe("MID")
    expect(valueText(`track-volume-${audio.id}`)).toBe("-12.50")
    const pan = root.renderer.findByTestId(`track-pan-${audio.id}`)
    if (!pan) throw new Error("Missing native pan control")
    root.renderer.nativeSimulateKeystrokes(pan.id, "enter")
    root.renderer.simulateKeystrokes("cmd-a w 2 5 enter")
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === audio.id)?.pan
    ).toBe(-0.25)
    const off = root.renderer.findByTestId(`track-monitor-off-${audio.id}`)
    const bounds = off && root.renderer.getElementBounds(off.id)
    if (!off || !bounds) throw new Error("Missing native monitor choice")
    expect(off.customProps?.["aria-label"]).toContain("MODE-OFF")
    expect(root.renderer.findByText("MODE-OFF")).toBeDefined()
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    expect(
      useProjectState.getState().document.tracks.find(track => track.id === audio.id)?.monitor
    ).toBe("off")
    expect(root.renderer.findByText("MODE-OFF")).toBeDefined()
  } finally {
    root.unmount()
    try {
      hydrateProject(snapshot)
    } finally {
      projectStore.setState(saved, true)
    }
  }
})
