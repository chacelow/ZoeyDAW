import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import {
  configureProjectBackend,
  projectActions,
  readProjectPeaks,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createVerificationMedia } from "../demo/media"
import type { VerificationMedia } from "../demo/media"
import { seedClipEditProject } from "../demo/project"
import { SourceWaveform } from "./SourceWaveform"

let root: TestRoot | undefined
let media: VerificationMedia | undefined
let release: (() => void) | undefined
let restoreBackend: (() => void) | undefined
let redraw: (() => void) | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  release?.()
  release = undefined
  restoreBackend?.()
  restoreBackend = undefined
  media?.dispose()
  media = undefined
  redraw = undefined
})

function columnHeight(pixel: number): number | null {
  if (!root) throw new Error("Waveform test root is not mounted")
  redraw?.()
  root.renderer.flush()
  const peaks = root.renderer.findByTestId("source-peaks")
  if (!peaks) return null
  const column = root.renderer.getElement(peaks.id)?.children[pixel]
  if (column === undefined) throw new Error(`Missing waveform column ${pixel}`)
  const bounds = root.renderer.getElementBounds(column)
  if (!bounds) throw new Error(`Missing waveform column bounds ${pixel}`)
  return bounds.height
}

function visibleHeight(pixel: number): number {
  const height = columnHeight(pixel)
  if (height === null) throw new Error(`Waveform column ${pixel} is not visible`)
  return height
}

test("stable peak reader follows native session opening, tempo, meter, and reopening", async () => {
  media = createVerificationMedia()
  restoreBackend = configureProjectBackend(createNativeBackend)
  const { audio } = seedClipEditProject(media.uri, "normal")
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(candidate => candidate.id === audio)
  if (clip?.kind !== "audio" || !clip.samplePath) throw new Error("Missing seeded audio source")

  root = createTestRoot({ width: 80, height: 80 })
  redraw = () =>
    root?.render(
      <div style={{ width: 80, height: 80 }}>
        <SourceWaveform
          sourceId={clip.samplePath}
          view={{ start: 0, span: 1 }}
          window={{ start: 0, end: 1 }}
          width={64}
          height={80}
          gain={1}
          reverse={false}
          color="#fff"
          readPeaks={readProjectPeaks}
          testId="source-peaks"
        />
      </div>
    )
  redraw()
  expect(columnHeight(16)).toBeNull()

  release = startProjectRuntime()
  expect(await whenProjectBackendIdle()).toBe(true)
  expect(useProjectState.getState().session.backend.phase).toBe("ready")
  const opened = visibleHeight(16)
  expect(opened).toBeGreaterThan(1)

  projectActions.setBpm(240)
  expect(await whenProjectBackendIdle()).toBe(true)
  const faster = visibleHeight(16)
  expect(faster).toBeLessThan(opened)

  projectActions.setNumerator(2)
  expect(await whenProjectBackendIdle()).toBe(true)
  const shorterMeter = visibleHeight(16)
  expect(shorterMeter).toBeLessThan(faster)

  projectActions.setDenominator(8)
  expect(await whenProjectBackendIdle()).toBe(true)
  const finerMeter = visibleHeight(16)
  expect(finerMeter).toBeLessThan(shorterMeter)

  release()
  release = undefined
  expect(columnHeight(16)).toBeNull()
  release = startProjectRuntime()
  expect(await whenProjectBackendIdle()).toBe(true)
  expect(useProjectState.getState().session.backend.phase).toBe("ready")
  expect(visibleHeight(16)).toBeCloseTo(finerMeter, 0)
})
