import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider } from "../../shared/theme/ThemeProvider"
import { Button, Input } from "../../ui/controls"
import { createWindowKeyboard } from "."

function KeyboardHosts() {
  const [pressed, setPressed] = useState(false)
  return (
    <ThemeProvider>
      <div style={{ display: "flex", flexDirection: "column", width: 320, height: 120 }}>
        <Button
          label="Keyboard button"
          testId="keyboard-button"
          active={pressed}
          onActiveChange={setPressed}
          style={{ width: 120 }}
        >
          {pressed ? "Pressed" : "Released"}
        </Button>
        <Input aria-label="Editor" testId="keyboard-input" style={{ width: 120 }} />
      </div>
    </ThemeProvider>
  )
}

test("Space leaves real Button state unchanged and reaches WindowKeyboard", () => {
  const keyboard = createWindowKeyboard()
  const received: string[] = []
  const unsubscribe = keyboard.subscribe("keyDown", event => {
    received.push(event.key ?? "")
  })
  const root = createTestRoot({ width: 320, height: 120, ...keyboard.rootHandlers })
  try {
    root.render(<KeyboardHosts />)
    const button = root.renderer.findByTestId("keyboard-button")
    if (!button) throw new Error("Missing keyboard button")
    const bounds = root.renderer.getElementBounds(button.id)
    if (!bounds) throw new Error("Missing button bounds")
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    expect(root.renderer.getAllText()).toContain("Pressed")
    root.renderer.nativeSimulateKeystrokes(button.id, "space")
    expect(root.renderer.getAllText()).toContain("Pressed")
    expect(received).toEqual(["space"])
  } finally {
    unsubscribe()
    root.unmount()
  }
})

test("Space in real Input does not reach WindowKeyboard", () => {
  const keyboard = createWindowKeyboard()
  const received: string[] = []
  const unsubscribe = keyboard.subscribe("keyDown", event => {
    received.push(event.key ?? "")
  })
  const root = createTestRoot({ width: 320, height: 120, ...keyboard.rootHandlers })
  try {
    root.render(<KeyboardHosts />)
    const input = root.renderer.findByTestId("keyboard-input")
    if (!input) throw new Error("Missing keyboard input")
    root.renderer.nativeSimulateKeystrokes(input.id, "space")
    expect(root.renderer.getFocusedElementId()).toBe(input.id)
    expect(received).toEqual([])
  } finally {
    unsubscribe()
    root.unmount()
  }
})
