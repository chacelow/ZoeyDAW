import { beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { projectActions, useProjectState } from "@/project/adapters"
import { ClipEditor } from "."
import type { ClipEditorEnvironment } from "./environment"
import { demoLabels } from "./demo/labels"
import { AUDIO_ID, MIDI_ID, PATTERN_ID, seed } from "./harness.test"

beforeEach(() => seed())
const environment: ClipEditorEnvironment = {
  clipboard: { readText: () => null, writeText: () => {} },
  subscribeWindowActive: () => () => {},
  drawMode: {
    markGesture: () => {},
    latch: enabled => projectActions.setMode("drawMode", enabled),
  },
  onRegionKey: () => {},
}
function flush(root: TestRoot) {
  for (let pass = 0; pass < 6; pass++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function bounds(root: TestRoot, id: string) {
  const element = root.renderer.findByTestId(id)
  const box = element && root.renderer.getElementBounds(element.id)
  if (!element || !box) throw new Error(`Missing native element ${id}`)
  return { element, ...box }
}
function render(root: TestRoot, id: string, design: DesignTokens, project = PROJECT_METRICS) {
  const track = useProjectState
    .getState()
    .document.tracks.find(item => item.clips.some(clip => clip.id === id))
  if (!track) throw new Error("Missing clip owner")
  root.render(
    <ThemeProvider design={design} project={project} defaultAppearance="dark">
      <div style={{ display: "flex", width: 900, height: 360 }}>
        <ClipEditor
          clipId={id}
          trackId={track.id}
          close={() => {}}
          labels={demoLabels.en}
          readPeaks={(_source, _start, _end, pixels) => new Float32Array(pixels * 4).fill(0.5)}
          environment={environment}
        />
      </div>
    </ThemeProvider>
  )
  flush(root)
}
function pixels(root: TestRoot, directory: string, name: string) {
  const file = path.join(directory, `${name}.png`)
  root.renderer.captureScreenshot(file)
  return readFileSync(file)
}
function paintChange(
  id: string,
  design: DesignTokens,
  activate: (root: TestRoot) => void = () => {},
  project = PROJECT_METRICS,
  baselineDesign = DEFAULT_DESIGN_TOKENS
) {
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-editor-configuration-"))
  const root = createTestRoot({ width: 900, height: 360 })
  try {
    render(root, id, baselineDesign)
    activate(root)
    flush(root)
    const before = pixels(root, directory, "before")
    render(root, id, design, project)
    const after = pixels(root, directory, "after")
    expect(after.equals(before)).toBe(false)
    render(root, id, baselineDesign)
    expect(pixels(root, directory, "restored").equals(before)).toBe(true)
  } finally {
    root.unmount()
    rmSync(directory, { recursive: true, force: true })
  }
}
for (const [field, value] of [
  ["gridMajorOpacity", 0.9],
  ["gridMinorOpacity", 0.9],
  ["arrangementGridMajorLineWidth", 4],
] as const) {
  test(`native MIDI paint recomputes project ${field} at runtime`, () => {
    paintChange(MIDI_ID, DEFAULT_DESIGN_TOKENS, () => {}, { ...PROJECT_METRICS, [field]: value })
  })
}
const editorCases = [
  ["dividerStrokeWidth", MIDI_ID, 3],
  ["loopStrokeWidth", AUDIO_ID, 3],
  ["selectionStrokeWidth", MIDI_ID, 3],
  ["selectionLineWidth", AUDIO_ID, 4],
  ["markerLineWidth", AUDIO_ID, 4],
  ["loopLineWidth", MIDI_ID, 4],
  ["velocityLineWidth", MIDI_ID, 4],
  ["waveformAxisOpacity", AUDIO_ID, 0.9],
  ["midiLoopOpacity", MIDI_ID, 0.8],
  ["noteInset", MIDI_ID, 4],
  ["fadeStrokeWidth", AUDIO_ID, 4],
] as const
for (const [field, id, value] of editorCases) {
  test(`native editor paint follows ${field} runtime override`, () => {
    paintChange(
      id,
      { ...DEFAULT_DESIGN_TOKENS, editor: { ...DEFAULT_DESIGN_TOKENS.editor, [field]: value } },
      root => {
        if (field === "selectionStrokeWidth") {
          const grid = bounds(root, "midi-grid")
          root.renderer.nativeSimulateMouseDown(grid.x + grid.width * 0.65, grid.y + 15)
          root.renderer.nativeSimulateMouseMove(grid.x + grid.width * 0.8, grid.y + 80, 0)
        }
        if (field === "selectionLineWidth") {
          const waveform = bounds(root, "audio-surface")
          root.renderer.nativeSimulateMouseDown(
            waveform.x + waveform.width / 2,
            waveform.y + waveform.height / 2
          )
          root.renderer.nativeSimulateMouseUp(
            waveform.x + waveform.width / 2,
            waveform.y + waveform.height / 2
          )
        }
      }
    )
  })
}
for (const field of [
  "overviewViewport",
  "audioLoop",
  "markerHover",
  "marquee",
  "pianoIvoryDark",
  "pianoEbony",
] as const) {
  test(`native editor paint follows semantic recipe ${field}`, () => {
    const midi = field === "marquee" || field.startsWith("piano")
    paintChange(
      midi ? MIDI_ID : AUDIO_ID,
      {
        ...DEFAULT_DESIGN_TOKENS,
        colorRecipes: {
          ...DEFAULT_DESIGN_TOKENS.colorRecipes,
          editor: { ...DEFAULT_DESIGN_TOKENS.colorRecipes.editor, [field]: 5 },
        },
      },
      root => {
        if (field === "markerHover") {
          const marker = bounds(root, "audio-marker-start")
          root.renderer.nativeSimulateMouseMove(
            marker.x + marker.width / 2,
            marker.y + marker.height / 2
          )
        }
        if (field === "marquee") {
          const grid = bounds(root, "midi-grid")
          root.renderer.nativeSimulateMouseDown(grid.x + grid.width * 0.65, grid.y + 15)
          root.renderer.nativeSimulateMouseMove(grid.x + grid.width * 0.8, grid.y + 80, 0)
        }
      }
    )
  })
}
for (const [id, testId] of [
  [MIDI_ID, "midi-grid"],
  [MIDI_ID, "midi-key-64"],
  [MIDI_ID, "midi-velocity-retained"],
  [AUDIO_ID, "audio-marker-start"],
  [AUDIO_ID, "audio-overview"],
  [PATTERN_ID, "pattern-steps"],
] as const) {
  test(`native keyboard focus paint follows focus ring width for ${id} ${testId}`, () => {
    // A 1px velocity stem saturates both inset rings; leave room to distinguish their widths.
    const baselineDesign =
      testId === "midi-velocity-retained"
        ? {
            ...DEFAULT_DESIGN_TOKENS,
            editor: { ...DEFAULT_DESIGN_TOKENS.editor, velocityLineWidth: 8 },
          }
        : DEFAULT_DESIGN_TOKENS
    paintChange(
      id,
      { ...baselineDesign, shape: { ...baselineDesign.shape, focusRingWidth: 3 } },
      root => {
        const target = bounds(root, testId)
        root.renderer.nativeSimulateKeystrokes(target.element.id, "tab")
        root.renderer.focusElement(target.element.id)
        flush(root)
        expect(root.renderer.getFocusedElementId()).toBe(target.element.id)
      },
      PROJECT_METRICS,
      baselineDesign
    )
  })
}
test("native clip name typography follows semibold source", () => {
  paintChange(MIDI_ID, {
    ...DEFAULT_DESIGN_TOKENS,
    typography: {
      ...DEFAULT_DESIGN_TOKENS.typography,
      weights: { ...DEFAULT_DESIGN_TOKENS.typography.weights, semibold: 300 },
    },
  })
})
for (const [field, id, target] of [
  ["default", MIDI_ID, "midi-grid"],
  ["action", MIDI_ID, "midi-grid"],
  ["verticalResize", MIDI_ID, "midi-velocity"],
  ["horizontalResize", AUDIO_ID, "audio-marker-start"],
] as const) {
  test(`native pointer state resolves configured ${field} cursor`, () => {
    projectActions.setMode("drawMode", field === "action")
    const root = createTestRoot({ width: 900, height: 360 })
    try {
      render(root, id, {
        ...DEFAULT_DESIGN_TOKENS,
        cursors: { ...DEFAULT_DESIGN_TOKENS.cursors, [field]: "crosshair" },
      })
      const host = bounds(root, target)
      root.renderer.nativeSimulateMouseMove(host.x + host.width / 2, host.y + host.height / 2)
      expect(root.renderer.getElement(host.element.id)?.style.cursor).toBe("crosshair")
    } finally {
      root.unmount()
      projectActions.setMode("drawMode", false)
    }
  })
}
