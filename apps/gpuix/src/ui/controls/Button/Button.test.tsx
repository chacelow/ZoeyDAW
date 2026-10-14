import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "."
import { readOuterBounds } from "../useMeasuredTextWidth"

test("pointer and keyboard toggle once, disabled button ignores activation", () => {
  const root = createTestRoot({ width: 320, height: 160 })
  let latest = false
  function Harness() {
    const [active, setActive] = useState(false)
    return (
      <ThemeProvider>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            testId="toggle"
            label="Toggle"
            active={active}
            onActiveChange={next => {
              latest = next
              setActive(next)
            }}
          >
            Toggle
          </Button>
          <Button
            testId="disabled"
            disabled
            onClick={() => {
              throw new Error("disabled activation")
            }}
          >
            Disabled
          </Button>
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const node = root.renderer.findByTestId("toggle")!
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(node.id))!
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  expect(latest).toBe(true)
  root.renderer.nativeSimulateKeystrokes(node.id, "space")
  expect(latest).toBe(false)
  root.renderer.nativeSimulateKeystrokes(root.renderer.findByTestId("disabled")!.id, "enter")
  expect(latest).toBe(false)
  root.unmount()
})

test("icon buttons are square in both shared metric profiles", () => {
  const root = createTestRoot({ width: 200, height: 100 })
  root.render(
    <ThemeProvider>
      <div style={{ display: "flex", alignItems: "start", gap: 4 }}>
        <Button testId="small" iconOnly label="Small">
          S
        </Button>
        <Button testId="large" iconOnly size="transport" label="Large">
          L
        </Button>
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  const small = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("small")!.id)
  )!
  const large = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("large")!.id)
  )!
  expect(small.width).toBe(small.height)
  expect(large.width).toBe(large.height)
  expect(large.height).toBeGreaterThan(small.height)
  root.unmount()
})
