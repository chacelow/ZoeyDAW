import { expect, test } from "bun:test"
import { useRef } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Input } from "../Input"
import { Label } from "."
import type { PublicInstance } from "@gpuix/react"

test("label keyboard activation focuses its native editor without changing layout", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  function Form() {
    const control = useRef<PublicInstance | null>(null)
    return (
      <ThemeProvider>
        <div style={{ width: 240, gap: 8 }}>
          <Label testId="label" controlRef={control}>
            Name
          </Label>
          <Input ref={control} testId="input" value="" />
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Form />)
  root.renderer.flush()
  const label = root.renderer.findByTestId("label")
  const input = root.renderer.findByTestId("input")
  if (!label || !input) throw new Error("Missing form controls")
  const before = root.renderer.getElementBounds(label.id)
  expect(before?.width).toBeGreaterThan(0)
  root.renderer.nativeSimulateKeystrokes(label.id, "enter")
  expect(root.renderer.getFocusedElementId()).toBe(input.id)
  expect(root.renderer.getElementBounds(label.id)).toEqual(before)
  root.unmount()
})

test("disabled label does not move focus", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  function Form() {
    const control = useRef<PublicInstance | null>(null)
    return (
      <ThemeProvider>
        <div>
          <Label disabled testId="label" controlRef={control}>
            Name
          </Label>
          <Input ref={control} testId="input" />
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Form />)
  root.renderer.flush()
  const label = root.renderer.findByTestId("label")
  if (!label) throw new Error("Missing label")
  root.renderer.nativeSimulateKeystrokes(label.id, "space")
  expect(root.renderer.getFocusedElementId()).toBe(label.id)
  root.unmount()
})
