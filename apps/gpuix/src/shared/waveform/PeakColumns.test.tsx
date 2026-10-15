import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { PeakColumns } from "./PeakColumns"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

function columns(peaks: Float32Array, pixels: number, height: number) {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  root.render(
    <div style={{ width: 100, height: 100 }}>
      <PeakColumns
        testId="peaks"
        peaks={peaks}
        pixels={pixels}
        width={pixels}
        height={height}
        color="#fff"
      />
    </div>
  )
  root.renderer.flush()
  const host = root.renderer.findByTestId("peaks")
  if (!host) return []
  const hostBounds = root.renderer.getElementBounds(host.id)!
  return root.renderer
    .getElement(host.id)!
    .children.map(child => root.renderer.getElementBounds(child)!)
    .map(b => ({ x: b.x - hostBounds.x, y: b.y - hostBounds.y, height: b.height }))
}

test("stereo peaks are channel-major: left channel fills the top half, right the bottom", () => {
  // pixels=2: L0 [-1,1], L1 [0,0.5], R0 [-0.5,0], R1 [-2,2] (clamped)
  const peaks = new Float32Array([-1, 1, 0, 0.5, -0.5, 0, -2, 2])
  const result = columns(peaks, 2, 40)
  expect(result).toHaveLength(4)
  expect(result[0]).toEqual({ x: 0, y: 0, height: 20 })
  expect(result[1]).toEqual({ x: 1, y: 5, height: 5 })
  expect(result[2]).toEqual({ x: 0, y: 30, height: 5 })
  expect(result[3]).toEqual({ x: 1, y: 20, height: 20 })
})

test("silence still draws a 1px line; mismatched or empty input draws nothing", () => {
  expect(columns(new Float32Array([0, 0]), 1, 10)).toEqual([{ x: 0, y: 5, height: 1 }])
  expect(columns(new Float32Array(0), 4, 10)).toEqual([])
  expect(columns(new Float32Array([0, 0, 0, 0]), 4, 10)).toEqual([])
})
