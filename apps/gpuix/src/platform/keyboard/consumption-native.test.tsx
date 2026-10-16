import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { consumeKey, createWindowKeyboard } from "."
import type { CommandHandler, CommandResult } from "."

test("handled local commands stop the real native window phase while pass reaches it", () => {
  const keyboard = createWindowKeyboard()
  let result: CommandResult = "handled"
  let setWindowValue: (value: string) => void = () => {}
  const unsubscribe = keyboard.subscribe("keyDown", () => setWindowValue("Window received"))
  const windowPhases: string[] = []
  const root = createTestRoot({
    width: 320,
    height: 120,
    onKeyDown: event => {
      windowPhases.push(event.key ?? "")
      keyboard.rootHandlers.onKeyDown(event)
    },
    onKeyUp: keyboard.rootHandlers.onKeyUp,
  })
  function Harness() {
    const [localValue, setLocalValue] = useState("Local idle")
    const [windowValue, updateWindowValue] = useState("Window idle")
    setWindowValue = updateWindowValue
    const command: CommandHandler = event => {
      if (event.defaultPrevented) return "pass"
      if (result === "handled") setLocalValue("Local handled")
      return result
    }
    return (
      <div
        testId="command-host"
        role="application"
        tabIndex={0}
        onKeyDown={event => consumeKey(event, command(event))}
      >
        <text>{localValue}</text>
        <text>{windowValue}</text>
      </div>
    )
  }
  try {
    root.render(<Harness />)
    const host = root.renderer.findByTestId("command-host")
    if (!host) throw new Error("Missing command host")
    root.renderer.nativeSimulateKeystrokes(host.id, "home")
    expect(root.renderer.getAllText()).toContain("Local handled")
    expect(root.renderer.getAllText()).toContain("Window idle")
    expect(root.renderer.getAllText()).not.toContain("Window received")
    expect(windowPhases).toEqual([])
    result = "pass"
    root.renderer.nativeSimulateKeystrokes(host.id, "home")
    expect(root.renderer.getAllText()).toContain("Window received")
    expect(windowPhases).toEqual(["home"])
  } finally {
    root.unmount()
    unsubscribe()
  }
})
