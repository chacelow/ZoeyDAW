import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { ToggleGroup, ToggleGroupItem } from "."

test("single toggle keyboard activation clears selection and arrows only move focus", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let latest = "a"
  function Form() {
    const [value, setValue] = useState("a")
    return (
      <ThemeProvider>
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={next => {
            latest = next
            setValue(next)
          }}
        >
          <ToggleGroupItem testId="a" value="a">
            A
          </ToggleGroupItem>
          <ToggleGroupItem value="b" disabled>
            B
          </ToggleGroupItem>
          <ToggleGroupItem testId="c" value="c">
            C
          </ToggleGroupItem>
        </ToggleGroup>
      </ThemeProvider>
    )
  }
  root.render(<Form />)
  root.renderer.flush()
  const first = root.renderer.findByTestId("a")
  const last = root.renderer.findByTestId("c")
  if (!first || !last) throw new Error("Missing toggles")
  const before = root.renderer.getElementBounds(first.id)
  root.renderer.nativeSimulateKeystrokes(first.id, "space")
  expect(latest).toBe("a")
  root.renderer.nativeSimulateKeystrokes(first.id, "enter")
  expect(latest).toBe("")
  expect(root.renderer.getElementBounds(first.id)).toEqual(before)
  root.renderer.simulateKeystrokes("right")
  expect(root.renderer.getFocusedElementId()).toBe(last.id)
  expect(latest).toBe("")
  root.renderer.simulateKeystrokes("enter")
  expect(latest).toBe("c")
  root.renderer.simulateKeystrokes("home")
  expect(root.renderer.getFocusedElementId()).toBe(first.id)
  root.unmount()
})

test("multiple toggles independently add and remove values; group disabled blocks activation", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let latest: string[] = []
  function Form({ disabled = false }: { disabled?: boolean }) {
    const [value, setValue] = useState<string[]>([])
    return (
      <ThemeProvider>
        <ToggleGroup
          type="multiple"
          value={value}
          disabled={disabled}
          onValueChange={next => {
            latest = next
            setValue(next)
          }}
        >
          <ToggleGroupItem testId="a" value="a">
            A
          </ToggleGroupItem>
          <ToggleGroupItem testId="b" value="b">
            B
          </ToggleGroupItem>
        </ToggleGroup>
      </ThemeProvider>
    )
  }
  root.render(<Form />)
  root.renderer.flush()
  const a = root.renderer.findByTestId("a")
  const b = root.renderer.findByTestId("b")
  if (!a || !b) throw new Error("Missing toggles")
  root.renderer.nativeSimulateKeystrokes(a.id, "space")
  expect(latest).toEqual([])
  root.renderer.nativeSimulateKeystrokes(a.id, "enter")
  root.renderer.nativeSimulateKeystrokes(b.id, "enter")
  expect(latest).toEqual(["a", "b"])
  root.renderer.nativeSimulateKeystrokes(a.id, "enter")
  expect(latest).toEqual(["b"])
  root.render(<Form disabled />)
  root.renderer.flush()
  root.renderer.nativeSimulateKeystrokes(b.id, "enter")
  expect(latest).toEqual(["b"])
  root.unmount()
})
