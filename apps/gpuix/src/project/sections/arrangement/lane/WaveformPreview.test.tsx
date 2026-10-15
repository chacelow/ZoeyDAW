import { afterEach, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { WaveformPreview } from "./WaveformPreview"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"

let root: TestRoot | undefined
let directory: string | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

it("preserves channel-major stereo envelopes without interleaving their pixels", () => {
  const peaks = new Float32Array([
    -1, 1, -0.5, 0.5, 0, 0.25, 0, 0, 0, 0, 0.25, 0.5, -0.75, -0.25, -1, 1,
  ])
  root = createTestRoot({ width: 100, height: 100 })
  directory = mkdtempSync(path.join(tmpdir(), "lane-stereo-pixels-"))
  const actualPath = path.join(directory, "actual.png")
  const referencePath = path.join(directory, "reference.png")
  root.render(
    <ThemeProvider>
      <div style={{ width: 100, height: 100, position: "relative", backgroundColor: "#000" }}>
        <WaveformPreview
          id="stereo"
          sourceId="fixture.wav"
          startBar={1}
          endBar={2}
          contentOffsetBars={0}
          width={4}
          height={80}
          top={10}
          color="#fff"
          opacity={1}
          readPeaks={() => peaks}
        />
      </div>
    </ThemeProvider>
  )
  root.renderer.captureScreenshot(actualPath)
  const amplitude = 20 - PROJECT_METRICS.arrangementWaveformInset
  const reference = [
    { x: 0, y: 30 - amplitude, height: amplitude * 2 },
    { x: 1, y: 30 - amplitude / 2, height: amplitude },
    { x: 2, y: 30 - amplitude / 4, height: amplitude / 4 },
    { x: 3, y: 30, height: 1 },
    { x: 0, y: 70, height: 1 },
    { x: 1, y: 70 - amplitude / 2, height: amplitude / 4 },
    { x: 2, y: 70 + amplitude / 4, height: amplitude / 2 },
    { x: 3, y: 70 - amplitude, height: amplitude * 2 },
  ]
  root.render(
    <ThemeProvider>
      <div style={{ width: 100, height: 100, position: "relative", backgroundColor: "#000" }}>
        {reference.map((column, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: column.x,
              top: column.y,
              width: 1,
              height: column.height,
              backgroundColor: "#fff",
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
    </ThemeProvider>
  )
  root.renderer.captureScreenshot(referencePath)
  expect(readFileSync(actualPath)).toEqual(readFileSync(referencePath))
})
