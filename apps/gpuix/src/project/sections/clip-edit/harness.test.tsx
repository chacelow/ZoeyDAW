import { ControlEnvironmentProvider } from "@/ui/controls"
import { TEST_INPUT_POLICY } from "@/ui/controls/DragPad/input-policy.test-fixture"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { createWindowKeyboard } from "@/platform/keyboard"
import type { WindowKeyEvent } from "@/platform/keyboard"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ClipEditor } from "."
import { clipEditorLabels as demoLabels } from "@/app/locales/sections/clip-edit"
import type { Clip, MidiNote } from "@/project/model/types"
import type { ClipEditorEnvironment } from "./environment"
import type { ClipEditorLabels } from "./labels"

export const MIDI_ID = "midi-test"
export const PATTERN_ID = "pattern-test"
export const AUDIO_ID = "audio-1"

/** Web fixture: a one-bar MIDI clip showing source beats 2–6, one note crossing its left edge. */
export function seed(extra: (clips: Clip[]) => void = () => {}) {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.id === "trager")
  if (!track) throw new Error("Missing MIDI track")
  track.clips.push(
    {
      id: MIDI_ID,
      kind: "midi",
      startBar: 1,
      lengthBars: 1,
      sourceOffsetBars: 0.5,
      notes: [
        { id: "retained", pitch: 72, startBeat: 0, lengthBeats: 3, velocity: 90 },
        { id: "visible", pitch: 64, startBeat: 3, lengthBeats: 1, velocity: 80 },
      ],
    },
    {
      id: PATTERN_ID,
      kind: "pattern",
      patternId: "steps",
      startBar: 3,
      lengthBars: 1,
      steps: Array.from({ length: 16 }, () => false),
    }
  )
  extra(track.clips)
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
}

export function clipById(id: string): Clip {
  for (const track of useProjectState.getState().document.tracks)
    for (const clip of track.clips) if (clip.id === id) return clip
  throw new Error(`Missing clip ${id}`)
}

export function notes(): MidiNote[] {
  const clip = clipById(MIDI_ID)
  if (clip.kind !== "midi") throw new Error("Expected MIDI")
  return clip.notes
}

export interface Harness {
  readonly root: TestRoot
  readonly windowKeys: string[]
  readonly clipboard: { text: string | null }
  readonly drawMarks: { count: number }
  readonly regionKeys: (number | undefined)[]
  setActive(active: boolean): void
  render(id?: string): void
  bounds(testId: string): { x: number; y: number; width: number; height: number }
  /** Content point → window point inside the piano-roll grid. */
  gridPoint(x: number, y: number): [number, number]
  key(testId: string, keystrokes: string): void
  unmount(): void
}
const TEST_SIZE = { width: 900, height: 360 }

export function mount(
  id = MIDI_ID,
  size = TEST_SIZE,
  labels: ClipEditorLabels = demoLabels.en
): Harness {
  const keyboard = createWindowKeyboard()
  const windowKeys: string[] = []
  keyboard.subscribe("keyDown", (event: WindowKeyEvent) => {
    windowKeys.push(event.key ?? "")
    if (event.key === "space") projectActions.togglePlay()
  })
  const root = createTestRoot({ ...size, ...keyboard.rootHandlers })
  const clipboard = { text: null as string | null }
  const drawMarks = { count: 0 }
  const regionKeys: (number | undefined)[] = []
  const listeners = new Set<(active: boolean) => void>()
  const environment: ClipEditorEnvironment = {
    clipboard: {
      readText: () => clipboard.text,
      writeText: text => {
        clipboard.text = text
      },
    },
    subscribeWindowActive: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    drawMode: {
      markGesture: () => {
        drawMarks.count++
      },
      latch: enabled => projectActions.setMode("drawMode", enabled),
    },
    onRegionKey: keystrokeId => {
      regionKeys.push(keystrokeId)
    },
  }
  let current = id
  const view = () => {
    const clip = clipById(current)
    const track = useProjectState
      .getState()
      .document.tracks.find(item => item.clips.some(entry => entry.id === current))
    if (!track) throw new Error("Missing track")
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <div style={{ display: "flex", width: size.width, height: size.height }}>
            <ClipEditor
              clipId={clip.id}
              trackId={track.id}
              close={() => {}}
              labels={labels}
              readPeaks={(_source, _start, _end, pixels) => new Float32Array(pixels * 4).fill(0.5)}
              environment={environment}
            />
          </div>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  const unsubscribe = useProjectState.subscribe(() => root.render(view()))
  root.render(view())
  // onLayout arrives after paint; dispatch it and render the measured layout.
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  const bounds = (testId: string) => {
    const element = root.renderer.findByTestId(testId)
    const box = element && root.renderer.getElementBounds(element.id)
    if (!box) throw new Error(`Missing bounds for ${testId}`)
    return box
  }
  return {
    root,
    windowKeys,
    clipboard,
    drawMarks,
    regionKeys,
    setActive: active => {
      for (const listener of listeners) listener(active)
    },
    render: next => {
      if (next) current = next
      root.render(view())
    },
    bounds,
    gridPoint: (x, y) => {
      const grid = bounds("midi-grid")
      return [grid.x + x, grid.y + y]
    },
    key: (testId, keystrokes) => {
      const element = root.renderer.findByTestId(testId)
      if (!element) throw new Error(`Missing ${testId}`)
      root.renderer.nativeSimulateKeystrokes(element.id, keystrokes)
    },
    unmount: () => {
      unsubscribe()
      root.unmount()
    },
  }
}
