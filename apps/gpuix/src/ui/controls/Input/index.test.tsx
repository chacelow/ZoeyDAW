import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "../../../shared/theme/ThemeProvider"
import { Input } from "."

test("native editor commits event.value and preserves compact geometry while focused", () => {
  const windowKeys: string[] = []
  const inputKeys: string[] = []
  const changedValues: string[] = []
  const root = createTestRoot({
    width: 400,
    height: 180,
    onKeyDown: event => {
      windowKeys.push(event.key ?? "")
    },
  })
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
          onKeyDown={event => {
            inputKeys.push(event.key ?? "")
          }}
          onChange={event => {
            if (event.value !== undefined) changedValues.push(event.value)
          }}
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
  expect(changedValues.at(-1)).toBe("abc")
  expect(inputKeys).toEqual(["a", "b", "c"])
  expect(windowKeys).toEqual([])
  root.renderer.simulateKeystrokes("backspace")
  expect(latest).toBe("ab")
  expect(windowKeys).toEqual([])
  root.renderer.simulateKeystrokes("space")
  expect(latest).toBe("ab ")
  expect(changedValues.at(-1)).toBe("ab ")
  expect(inputKeys.at(-1)).toBe("space")
  expect(windowKeys).toEqual([])
  expect(readOuterBounds(root.renderer, root.renderer.getElement(input.id))).toEqual(bounds)
  root.unmount()
})

test("native input preserves navigation and Cmd/Ctrl shortcuts for the window", () => {
  const windowKeys: string[] = []
  const inputKeys: string[] = []
  const root = createTestRoot({
    width: 400,
    height: 180,
    onKeyDown: event => {
      windowKeys.push(event.key ?? "")
    },
  })
  root.render(
    <ThemeProvider>
      <Input
        testId="input"
        value="abc"
        onKeyDown={event => {
          inputKeys.push(event.key ?? "")
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  const input = root.renderer.findByTestId("input")
  if (!input) throw new Error("Missing input")
  const keystrokes = [
    { keystroke: "tab", key: "tab" },
    { keystroke: "escape", key: "escape" },
    { keystroke: "up", key: "up" },
    { keystroke: "down", key: "down" },
    { keystroke: "cmd-s", key: "s" },
    { keystroke: "ctrl-s", key: "s" },
  ]
  for (const { keystroke, key } of keystrokes) {
    const inputCount = inputKeys.length
    const windowCount = windowKeys.length
    root.renderer.nativeSimulateKeystrokes(input.id, keystroke)
    expect(inputKeys.slice(inputCount)).toEqual([key])
    expect(windowKeys.slice(windowCount)).toEqual([key])
  }
  root.unmount()
})

test("native editing actions change text and never escape to project shortcuts", () => {
  const windowKeys: string[] = []
  const inputKeys: string[] = []
  const submitted: string[] = []
  let latest = "abc"
  const root = createTestRoot({
    width: 400,
    height: 180,
    onKeyDown: event => {
      windowKeys.push(event.key ?? "")
    },
  })
  function Form() {
    const [value, setValue] = useState("abc")
    return (
      <Input
        testId="input"
        value={value}
        onKeyDown={event => {
          inputKeys.push(event.key ?? "")
        }}
        onSubmit={event => {
          submitted.push(event.value ?? "")
        }}
        onValueChange={next => {
          latest = next
          setValue(next)
        }}
      />
    )
  }
  try {
    root.render(
      <ThemeProvider>
        <Form />
      </ThemeProvider>
    )
    const input = root.renderer.findByTestId("input")!
    root.renderer.nativeSimulateKeystrokes(input.id, "left backspace")
    expect(latest).toBe("ac")
    root.renderer.simulateKeystrokes("cmd-z")
    expect(latest).toBe("abc")
    root.renderer.simulateKeystrokes("end backspace")
    expect(latest).toBe("ab")
    root.renderer.simulateKeystrokes("ctrl-z")
    expect(latest).toBe("abc")
    root.renderer.simulateKeystrokes("home right x end y enter")
    expect(latest).toBe("axbcy")
    expect(submitted).toEqual(["axbcy"])
    expect(inputKeys).toEqual(["x", "y"])
    expect(windowKeys).toEqual([])
  } finally {
    root.unmount()
  }
})

test("disabled and read-only native editors reject text edits", () => {
  for (const mode of ["disabled", "readonly"]) {
    const windowKeys: string[] = []
    const inputKeys: string[] = []
    const root = createTestRoot({
      width: 400,
      height: 180,
      onKeyDown: event => {
        windowKeys.push(event.key ?? "")
      },
    })
    let changes = 0
    root.render(
      <ThemeProvider>
        <Input
          testId="input"
          value="fixed"
          disabled={mode === "disabled"}
          readOnly={mode === "readonly"}
          onKeyDown={event => {
            inputKeys.push(event.key ?? "")
          }}
          onValueChange={() => {
            changes += 1
          }}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const input = root.renderer.findByTestId("input")
    if (!input) throw new Error("Missing input")
    root.renderer.nativeSimulateKeystrokes(input.id, "a space")
    expect(inputKeys).toEqual(["a", "space"])
    expect(windowKeys).toEqual(["a", "space"])
    expect(changes).toBe(0)
    root.unmount()
  }
})
