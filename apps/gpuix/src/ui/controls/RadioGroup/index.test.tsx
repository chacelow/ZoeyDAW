import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { RadioGroup, RadioGroupItem } from "."

test("radio arrows wrap, skip disabled items, and Home/End update controlled selection", () => {
  const root = createTestRoot({ width: 400, height: 240 })
  let latest = "a"
  function Form() {
    const [value, setValue] = useState("a")
    return (
      <ThemeProvider>
        <RadioGroup
          value={value}
          onValueChange={next => {
            latest = next
            setValue(next)
          }}
        >
          <div>
            <RadioGroupItem value="a" testId="a">
              A
            </RadioGroupItem>
          </div>
          <RadioGroupItem value="b" testId="b" disabled>
            B
          </RadioGroupItem>
          <RadioGroupItem value="c" testId="c">
            C
          </RadioGroupItem>
        </RadioGroup>
      </ThemeProvider>
    )
  }
  root.render(<Form />)
  root.renderer.flush()
  const first = root.renderer.findByTestId("a")
  const last = root.renderer.findByTestId("c")
  if (!first || !last) throw new Error("Missing radios")
  const firstBounds = root.renderer.getElementBounds(first.id)
  const lastBounds = root.renderer.getElementBounds(last.id)
  expect(lastBounds?.y).toBeGreaterThan(firstBounds?.y ?? 0)
  root.renderer.nativeSimulateKeystrokes(first.id, "down")
  expect(latest).toBe("c")
  expect(root.renderer.getFocusedElementId()).toBe(last.id)
  root.renderer.simulateKeystrokes("down")
  expect(latest).toBe("a")
  root.renderer.simulateKeystrokes("end")
  expect(latest).toBe("c")
  root.renderer.simulateKeystrokes("home")
  expect(latest).toBe("a")
  const disabled = root.renderer.findByTestId("b")
  if (!disabled) throw new Error("Missing disabled radio")
  root.renderer.nativeSimulateKeystrokes(disabled.id, "space")
  expect(latest).toBe("a")
  root.unmount()
})

test("controlled radio does not keep an independent selection", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  const requested: string[] = []
  root.render(
    <ThemeProvider>
      <RadioGroup
        orientation="horizontal"
        value="a"
        onValueChange={value => {
          requested.push(value)
        }}
      >
        <RadioGroupItem testId="a" value="a">
          A
        </RadioGroupItem>
        <RadioGroupItem testId="c" value="c">
          C
        </RadioGroupItem>
      </RadioGroup>
    </ThemeProvider>
  )
  root.renderer.flush()
  const first = root.renderer.findByTestId("a")
  if (!first) throw new Error("Missing radio")
  root.renderer.nativeSimulateKeystrokes(first.id, "right")
  expect(requested).toEqual(["c"])
  root.renderer.simulateKeystrokes("space")
  expect(requested).toEqual(["c", "c"])
  root.unmount()
})
