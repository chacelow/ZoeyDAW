import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "../../../shared/theme/ThemeProvider"
import { Input } from "."

test("native editor commits event.value and preserves compact geometry while focused", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let latest = ""
  let height = 0
  function Form() {
    const [value, setValue] = useState("")
    height = useTheme().control["--spacing-control-track"]
    return (
      <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
        <div testId="before-input" style={{ height: 1 }} />
        <Input
          testId="input"
          value={value}
          onValueChange={next => {
            latest = next
            setValue(next)
          }}
        />
        <div testId="after-input" style={{ height: 1 }} />
      </div>
    )
  }
  root.render(
    <ThemeProvider>
      <Form />
    </ThemeProvider>
  )
  root.renderer.flush()
  const input = root.renderer.findByTestId("input")
  if (!input) throw new Error("Missing input")
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(input.id))
  const before = root.renderer.findByTestId("before-input")
  const after = root.renderer.findByTestId("after-input")
  if (!before || !after) throw new Error("Missing layout markers")
  const beforeBounds = readOuterBounds(root.renderer, root.renderer.getElement(before.id))
  const afterBounds = readOuterBounds(root.renderer, root.renderer.getElement(after.id))
  if (!beforeBounds || !afterBounds) throw new Error("Unpainted layout markers")
  expect(afterBounds.y - beforeBounds.y - beforeBounds.height).toBe(height)
  root.renderer.nativeSimulateKeystrokes(input.id, "a b c")
  expect(latest).toBe("abc")
  root.renderer.simulateKeystrokes("backspace")
  expect(latest).toBe("ab")
  expect(readOuterBounds(root.renderer, root.renderer.getElement(input.id))).toEqual(bounds)
  root.unmount()
})

test("disabled and read-only native editors reject text edits", () => {
  for (const mode of ["disabled", "readonly"]) {
    const root = createTestRoot({ width: 400, height: 180 })
    let changes = 0
    root.render(
      <ThemeProvider>
        <Input
          testId="input"
          value="fixed"
          disabled={mode === "disabled"}
          readOnly={mode === "readonly"}
          onValueChange={() => {
            changes += 1
          }}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const input = root.renderer.findByTestId("input")
    if (!input) throw new Error("Missing input")
    root.renderer.nativeSimulateKeystrokes(input.id, "a")
    expect(changes).toBe(0)
    root.unmount()
  }
})
