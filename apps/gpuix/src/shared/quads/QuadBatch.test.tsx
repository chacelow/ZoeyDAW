import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useLayoutEffect } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { QuadBatch } from "./QuadBatch"
import { useQuadBatch } from "./useQuadBatch"
import type { QuadBatchController } from "./useQuadBatch"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test("imperative buffer changes do not render the component or replace its native host", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  const control: { current: QuadBatchController | null } = { current: null }
  let renders = 0
  function Fixture() {
    renders++
    const batch = useQuadBatch()
    control.current = batch
    return (
      <QuadBatch ref={batch.ref} testId="batch" style={{ width: 100, height: 100, color: "red" }} />
    )
  }
  root.render(<Fixture />)
  const batch = control.current
  if (!batch) throw new Error("Controller was not mounted")
  const host = root.renderer.findByTestId("batch")
  if (!host) throw new Error("Batch host was not mounted")
  const upload = spyOn(root.renderer, "setQuads")
  try {
    const values = new Float32Array([1, 2, 3, 4])
    flushSync(() => batch.setQuads(values))
    root.renderer.flush()
    expect(renders).toBe(1)
    expect(upload).toHaveBeenCalledTimes(1)
    flushSync(() => batch.setQuads(values))
    expect(upload).toHaveBeenCalledTimes(1)
    flushSync(() => batch.setQuads(new Float32Array([10, 20, 30, 40])))
    root.renderer.flush()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(renders).toBe(1)
    expect(root.renderer.findByTestId("batch")?.id).toBe(host.id)
    expect(root.renderer.getRetainedElementCount()).toBe(1)
  } finally {
    upload.mockRestore()
  }
})

test("data set before mounting paints on attach and survives native host remount", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  const control: { current: QuadBatchController | null } = { current: null }
  function Fixture({ shown }: { shown: boolean }) {
    const batch = useQuadBatch()
    control.current = batch
    return shown ? (
      <QuadBatch
        ref={batch.ref}
        testId="pending"
        style={{ width: 100, height: 100, color: "red" }}
      />
    ) : null
  }
  const directory = mkdtempSync(path.join(tmpdir(), "gpuix-quad-pending-"))
  try {
    root.render(<Fixture shown={false} />)
    const batch = control.current
    if (!batch) throw new Error("Controller was not created")
    const values = new Float32Array([12, 18, 24, 30])
    batch.setQuads(new Float32Array([1, 1, 2, 2]))
    batch.setQuads(values)
    expect(root.renderer.getRetainedElementCount()).toBe(0)
    root.render(<Fixture shown />)
    root.renderer.captureScreenshot(path.join(directory, "pending.png"))
    const host = root.renderer.findByTestId("pending")
    if (!host) throw new Error("Pending batch host was not mounted")
    root.renderer.setQuads(host.id, values)
    root.renderer.captureScreenshot(path.join(directory, "direct.png"))
    expect(readFileSync(path.join(directory, "pending.png"))).toEqual(
      readFileSync(path.join(directory, "direct.png"))
    )
    root.render(<Fixture shown={false} />)
    root.render(<Fixture shown />)
    root.renderer.captureScreenshot(path.join(directory, "remounted.png"))
    expect(readFileSync(path.join(directory, "remounted.png"))).toEqual(
      readFileSync(path.join(directory, "direct.png"))
    )
    expect(root.renderer.findByTestId("pending")?.id).not.toBe(host.id)
    root.unmount()
    batch.setQuads(values)
    expect(root.renderer.getRetainedElementCount()).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("invalid native stroke updates leave the prior tree unchanged", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  root.renderer.applyBatch(
    JSON.stringify([
      ["createElement", 700, "quad-batch"],
      ["setStyle", 700, { width: 100, height: 100, color: "red" }],
      ["setRoot", 700],
    ])
  )
  root.renderer.setQuads(700, new Float32Array([10, 10, 30, 30]))
  const directory = mkdtempSync(path.join(tmpdir(), "gpuix-quad-stroke-"))
  try {
    root.renderer.captureScreenshot(path.join(directory, "default.png"))
    root.renderer.applyBatch(
      JSON.stringify([
        ["setCustomProp", 700, "strokeWidth", 1],
        ["setCustomProp", 700, "strokeColor", "blue"],
      ])
    )
    root.renderer.captureScreenshot(path.join(directory, "before.png"))
    for (const [key, value] of [
      ["strokeWidth", -1],
      ["strokeWidth", -1e-100],
      ["strokeWidth", "1"],
      ["strokeWidth", 1e100],
      ["strokeColor", 42],
      ["strokeColor", "not-a-color"],
    ]) {
      expect(() =>
        root.renderer.applyBatch(
          JSON.stringify([
            ["setStyle", 700, { width: 100, height: 100, color: "green" }],
            ["setCustomProp", 700, key, value],
          ])
        )
      ).toThrow()
      root.renderer.captureScreenshot(path.join(directory, "after.png"))
      expect(readFileSync(path.join(directory, "after.png"))).toEqual(
        readFileSync(path.join(directory, "before.png"))
      )
    }
    for (const strokeWidth of [null, NaN, Infinity]) {
      root.renderer.applyBatch(JSON.stringify([["setCustomProp", 700, "strokeWidth", strokeWidth]]))
      root.renderer.captureScreenshot(path.join(directory, "removed.png"))
      expect(readFileSync(path.join(directory, "removed.png"))).toEqual(
        readFileSync(path.join(directory, "default.png"))
      )
    }
    root.renderer.applyBatch(
      JSON.stringify([
        ["setCustomProp", 700, "strokeWidth", 1],
        ["setCustomProp", 700, "strokeColor", null],
      ])
    )
    root.renderer.captureScreenshot(path.join(directory, "transparent.png"))
    expect(readFileSync(path.join(directory, "transparent.png"))).toEqual(
      readFileSync(path.join(directory, "default.png"))
    )
    root.renderer.applyBatch(JSON.stringify([["destroyElement", 700]]))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("quad paint passes input through despite cursor and pointerEvents auto", () => {
  const root = createTestRoot({ width: 100, height: 100 })
  roots.push(root)
  let clicks = 0
  function Fixture() {
    const batch = useQuadBatch()
    useLayoutEffect(() => batch.setQuads(new Float32Array([0, 0, 100, 100])), [batch])
    return (
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
          ref={batch.ref}
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
  }
  root.render(<Fixture />)
  root.renderer.nativeSimulateClick(20, 20)
  expect(clicks).toBe(1)
})
