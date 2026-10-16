import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useWindowSize } from "@gpuix/react"
import { createTestRoot, type TestRoot } from "@gpuix/react/testing"

if (process.platform !== "darwin")
  throw new Error("Unsupported platform: offscreen scaleFactor regression requires macOS")

let root: TestRoot | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
})

test.each([undefined, 1, 2])(
  "offscreen viewport and pixels preserve explicit scale %s",
  scaleFactor => {
    const requested = { width: 4000, height: 3000 }
    let viewport = { width: 0, height: 0 }
    function ViewportProbe() {
      viewport = useWindowSize()
      return <div testId="viewport" style={{ width: "100%", height: "100%" }} />
    }
    root = createTestRoot({ ...requested, scaleFactor })
    root.render(<ViewportProbe />)
    const element = root.renderer.findByTestId("viewport")
    if (!element) throw new Error("Missing viewport probe")
    const bounds = root.renderer.getElementBounds(element.id)
    console.log(JSON.stringify({ requested, viewport, bounds }))
    expect(viewport).toEqual(requested)
    expect(bounds?.width).toBe(requested.width)
    expect(bounds?.height).toBe(requested.height)
    const directory = mkdtempSync(path.join(tmpdir(), "gpuix-test-window-"))
    try {
      const image = path.join(directory, "viewport.png")
      root.renderer.captureScreenshot(image)
      const png = readFileSync(image)
      expect(png.readUInt32BE(16)).toBe(requested.width * (scaleFactor ?? 1))
      expect(png.readUInt32BE(20)).toBe(requested.height * (scaleFactor ?? 1))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e300, 1e-300])(
  "invalid offscreen backing scale %s fails at the native boundary",
  scaleFactor => {
    expect(() => createTestRoot({ scaleFactor })).toThrow(
      "TestGpuixRenderer scaleFactor must be a positive, finite number"
    )
  }
)
