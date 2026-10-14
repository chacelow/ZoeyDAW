import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { createWindowKeyboard } from "."

// This native host seam checks renderer delivery, not A3 Button's separate activation policy.
function KeyboardHosts() {
  const [pressed, setPressed] = useState(false)
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 320, height: 120 }}>
      <div
        role="button"
        tabIndex={0}
        testId="keyboard-button"
        onClick={() => setPressed(value => !value)}
        onKeyDown={event => {
          if (event.key === "enter") setPressed(value => !value)
        }}
        style={{ width: 120, height: 32 }}
      >
        <text>{pressed ? "Pressed" : "Released"}</text>
      </div>
      <input
        aria-label="Editor"
        testId="keyboard-input"
        onKeyDown={event => {
          if (event.key === "space") event.stopPropagation()
        }}
        style={{ width: 120, height: 32 }}
      />
    </div>
  )
}

test("native element key handling precedes WindowKeyboard and can stop its delivery", () => {
  const keyboard = createWindowKeyboard()
  const received: string[] = []
  const unsubscribe = keyboard.subscribe("keyDown", event => {
    received.push(event.key ?? "")
  })
  const root = createTestRoot({ width: 320, height: 120, ...keyboard.rootHandlers })
  try {
    root.render(<KeyboardHosts />)
    const button = root.renderer.findByTestId("keyboard-button")
    const input = root.renderer.findByTestId("keyboard-input")
    if (!button || !input) throw new Error("Missing keyboard host")
    const bounds = root.renderer.getElementBounds(button.id)
    if (!bounds) throw new Error("Missing button bounds")
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    expect(root.renderer.getAllText()).toContain("Pressed")
    root.renderer.nativeSimulateKeystrokes(button.id, "space")
    expect(root.renderer.getAllText()).toContain("Pressed")
    expect(received).toEqual(["space"])
    root.renderer.nativeSimulateKeystrokes(input.id, "space")
    expect(root.renderer.getFocusedElementId()).toBe(input.id)
    expect(received).toEqual(["space"])
  } finally {
    unsubscribe()
    root.unmount()
  }
})
