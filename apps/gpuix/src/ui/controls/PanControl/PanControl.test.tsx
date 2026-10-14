import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { PanControl } from "."

test("pan uses center reset and keyboard increments across both channels", () => {
  const root = createTestRoot({ width: 320, height: 160 })
  let latest = 0
  function Harness() {
    const [value, setValue] = useState(0)
    return (
      <ThemeProvider>
        <PanControl
          testId="pan"
          value={value}
          onChange={next => {
            latest = next
            setValue(next)
          }}
        />
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const pad = root.renderer.findByTestId("pan")!
  root.renderer.nativeSimulateKeystrokes(pad.id, "down")
  expect(latest).toBeCloseTo(-0.01)
  root.renderer.nativeSimulateKeystrokes(pad.id, "up up")
  expect(latest).toBeCloseTo(0.01)
  root.unmount()
})
