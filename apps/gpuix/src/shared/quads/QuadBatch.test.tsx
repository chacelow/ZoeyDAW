import { afterEach, expect, spyOn, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { QuadBatch } from "./QuadBatch"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test("stable buffers survive restyling without upload; new buffers update the same host", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  const upload = spyOn(root.renderer, "setQuads")
  const values = new Float32Array([1, 2, 3, 4])
  const render = (quads: Float32Array, color: string) =>
    root.render(
      <QuadBatch testId="batch" quads={quads} style={{ width: 100, height: 100, color }} />
    )
  try {
    render(values, "red")
    const id = root.renderer.findByTestId("batch")?.id
    expect(upload).toHaveBeenCalledTimes(1)
    render(values, "blue")
    expect(upload).toHaveBeenCalledTimes(1)
    render(new Float32Array([10, 20, 30, 40]), "blue")
    expect(upload).toHaveBeenCalledTimes(2)
    expect(root.renderer.findByTestId("batch")?.id).toBe(id)
    expect(root.renderer.getRetainedElementCount()).toBe(1)
    root.unmount()
    expect(root.renderer.getRetainedElementCount()).toBe(0)
  } finally {
    upload.mockRestore()
  }
})

test("quad paint passes input to the underlying native target even with pointerEvents auto", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  let clicks = 0
  root.render(
    <div style={{ width: 100, height: 100, position: "relative" }}>
      <div
        role="button"
        aria-label="Underlying target"
        tabIndex={0}
        onClick={() => {
          clicks++
        }}
        onKeyDown={event => {
          if (event.key === "enter") clicks++
        }}
        style={{ width: 100, height: 100, backgroundColor: "blue" }}
      />
      <QuadBatch
        quads={new Float32Array([0, 0, 100, 100])}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          color: "red",
          pointerEvents: "auto",
          cursor: "pointer",
        }}
      />
    </div>
  )
  root.renderer.nativeSimulateClick(20, 20)
  expect(clicks).toBe(1)
})
