import { afterEach, expect, test } from "bun:test"
import { useWindowSize } from "@gpuix/react"
import { createTestRoot, type TestRoot } from "@gpuix/react/testing"

let root: TestRoot | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
})

test("offscreen viewport preserves dimensions larger than the display", () => {
  const requested = { width: 4000, height: 3000 }
  let viewport = { width: 0, height: 0 }
  function ViewportProbe() {
    viewport = useWindowSize()
    return <div testId="viewport" style={{ width: "100%", height: "100%" }} />
  }
  root = createTestRoot(requested)
  root.render(<ViewportProbe />)
  const element = root.renderer.findByTestId("viewport")
  if (!element) throw new Error("Missing viewport probe")
  const bounds = root.renderer.getElementBounds(element.id)
  console.log(JSON.stringify({ requested, viewport, bounds }))
  expect(viewport).toEqual(requested)
  expect(bounds?.width).toBe(requested.width)
  expect(bounds?.height).toBe(requested.height)
})
