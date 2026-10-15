import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import { PeakColumns } from "./PeakColumns"

const roots: TestRoot[] = []
const directories: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

type Column = { x: number; y: number; height: number }

function comparePixels(
  peaks: Float32Array,
  pixels: number,
  height: number,
  expected: readonly Column[],
  inset = 0,
  top = 0,
  opacity = 1
) {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  const directory = mkdtempSync(path.join(tmpdir(), "peak-column-pixels-"))
  directories.push(directory)
  const capture = (content: ReactNode, name: string) => {
    root.render(
      <div style={{ position: "relative", width: 100, height: 100, backgroundColor: "#000" }}>
        {content}
      </div>
    )
    const file = path.join(directory, `${name}.png`)
    root.renderer.captureScreenshot(file)
    return readFileSync(file)
  }
  const actual = capture(
    <PeakColumns
      testId="peaks"
      peaks={peaks}
      pixels={pixels}
      width={pixels}
      height={height}
      color="#fff"
      inset={inset}
      top={top}
      opacity={opacity}
    />,
    "actual"
  )
  const reference = capture(
    expected.map((column, index) => (
      <div
        key={index}
        style={{
          position: "absolute",
          left: column.x,
          top: column.y + top,
          width: 1,
          height: column.height,
          backgroundColor: "#fff",
          opacity,
          pointerEvents: "none",
        }}
      />
    )),
    "reference"
  )
  expect(actual).toEqual(reference)
}

test("stereo peaks are channel-major: left channel fills the top half, right the bottom", () => {
  comparePixels(new Float32Array([-1, 1, 0, 0.5, -0.5, 0, -2, 2]), 2, 40, [
    { x: 0, y: 0, height: 20 },
    { x: 1, y: 5, height: 5 },
    { x: 0, y: 30, height: 5 },
    { x: 1, y: 20, height: 20 },
  ])
})

test("inset keeps full scale clear of every channel edge", () => {
  comparePixels(
    new Float32Array([-1, 1, -1, 1]),
    1,
    40,
    [
      { x: 0, y: 1, height: 18 },
      { x: 0, y: 21, height: 18 },
    ],
    1
  )
})

test("silence still draws a 1px line; mismatched or empty input draws nothing", () => {
  comparePixels(new Float32Array([0, 0]), 1, 10, [{ x: 0, y: 5, height: 1 }])
  comparePixels(new Float32Array(0), 4, 10, [])
  comparePixels(new Float32Array([0, 0, 0, 0]), 4, 10, [])
})

test("native batched waveform pixels match reference columns with fractional geometry and opacity", () => {
  comparePixels(
    new Float32Array([-1, 1, 0, 0.5, -0.5, 0, -2, 2]),
    2,
    40,
    [
      { x: 0, y: 1, height: 18 },
      { x: 1, y: 5.5, height: 4.5 },
      { x: 0, y: 30, height: 4.5 },
      { x: 1, y: 21, height: 18 },
    ],
    1,
    10,
    0.6
  )
})
