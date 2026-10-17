import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { decodeNativePng, type NativePng } from "@/shared/waveform/testing/native-png"
import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import {
  configureProjectBackend,
  projectActions,
  readProjectPeaks,
  openNewProject,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createVerificationMedia } from "../../../../app/verification/clip-edit/demo/media"
import type { VerificationMedia } from "../../../../app/verification/clip-edit/demo/media"
import { seedClipEditProject } from "../../../../app/verification/clip-edit/demo/project"
import { SourceWaveform } from "./SourceWaveform"

let root: TestRoot | undefined
let media: VerificationMedia | undefined
let release: (() => void) | undefined
let restoreBackend: (() => void) | undefined
let redraw: (() => void) | undefined
let captureDirectory: string | undefined

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
  if (captureDirectory) rmSync(captureDirectory, { recursive: true, force: true })
  captureDirectory = undefined
})

function firstStereoChannelHeight({ width, height, rgba }: NativePng, pixel: number): number {
  if (pixel < 0 || pixel >= width) throw new Error("Waveform pixel outside native capture")
  let first = -1
  let last = -1
  for (let y = 0; y < height / 2; y++) {
    const offset = (y * width + pixel) * 4
    if (
      rgba.readUInt8(offset) > 240 &&
      rgba.readUInt8(offset + 1) > 240 &&
      rgba.readUInt8(offset + 2) > 240 &&
      rgba.readUInt8(offset + 3) > 240
    ) {
      if (first < 0) first = y
      last = y
    }
  }
  return first < 0 ? 0 : last - first + 1
}

function columnHeight(pixel: number): number | null {
  if (!root) throw new Error("Waveform test root is not mounted")
  redraw?.()
  root.renderer.flush()
  const peaks = root.renderer.findByTestId("source-peaks")
  if (!peaks) return null
  captureDirectory ??= mkdtempSync(path.join(tmpdir(), "source-waveform-pixels-"))
  const filename = path.join(captureDirectory, "column.png")
  root.renderer.captureScreenshot(filename)
  const image = decodeNativePng(readFileSync(filename))
  expect(firstStereoChannelHeight(image, 79)).toBe(0)
  return firstStereoChannelHeight(image, pixel)
}

function visibleHeight(pixel: number): number {
  const height = columnHeight(pixel)
  if (height === null) throw new Error(`Waveform column ${pixel} is not visible`)
  return height
}

test("stable peak reader follows native session opening, tempo, meter, and reopening", async () => {
  media = createVerificationMedia()
  restoreBackend = configureProjectBackend(createNativeBackend)
  openNewProject("source-waveform-runtime")
  const { audio } = seedClipEditProject(media.uri, "normal")
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(candidate => candidate.id === audio)
  if (clip?.kind !== "audio" || !clip.samplePath) throw new Error("Missing seeded audio source")

  root = createTestRoot({ width: 80, height: 80 })
  redraw = () =>
    root?.render(
      <div style={{ width: 80, height: 80, backgroundColor: "#000" }}>
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
