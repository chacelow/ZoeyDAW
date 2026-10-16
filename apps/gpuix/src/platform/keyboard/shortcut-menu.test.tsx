import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { createKeymap } from "@/platform/keyboard"
import type { CommandId } from "@/platform/keyboard"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DropdownButton } from "@/ui/controls/DropdownButton"

test("native dropdown shortcut text and resolution follow a changed keymap", () => {
  let keymap = createKeymap([
    { keys: "F6", command: "arrangement.toggleAutomation", context: { focus: ["timeline"] } },
  ])
  const resolved: (CommandId | undefined)[] = []
  const root = createTestRoot({
    width: 480,
    height: 320,
    onKeyDown: event => {
      resolved.push(
        keymap.resolve(event, {
          focus: "timeline",
          computerKeyboard: false,
          browserSearch: false,
        })
      )
    },
  })
  const render = () => {
    root.render(
      <ThemeProvider>
        <DropdownButton
          testId="command-menu"
          label="Arrangement commands"
          value="automation"
          onChange={() => {}}
          items={[
            {
              id: "automation",
              label: "Toggle automation",
              shortcut: keymap.formatKeys("arrangement.toggleAutomation"),
            },
          ]}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
  }
  try {
    render()
    expect(root.renderer.findByText("F6")).toBeUndefined()
    const trigger = root.renderer.findByTestId("command-menu")
    if (!trigger) throw new Error("Missing command menu trigger")
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    const content = root.renderer.findByTestId("command-menu-content")
    if (!content) throw new Error("Command menu did not open")
    expect(root.renderer.findByText("F6")).toBeDefined()
    expect(root.renderer.findByText("F7")).toBeUndefined()
    resolved.length = 0
    root.renderer.nativeSimulateKeystrokes(content.id, "f6")
    root.renderer.nativeSimulateKeystrokes(content.id, "f7")
    expect(resolved).toEqual(["arrangement.toggleAutomation", undefined])

    keymap = createKeymap([
      { keys: "F7", command: "arrangement.toggleAutomation", context: { focus: ["timeline"] } },
    ])
    render()
    const updatedContent = root.renderer.findByTestId("command-menu-content")
    if (!updatedContent) throw new Error("Command menu closed during keymap change")
    expect(root.renderer.findByText("F6")).toBeUndefined()
    expect(root.renderer.findByText("F7")).toBeDefined()
    resolved.length = 0
    root.renderer.nativeSimulateKeystrokes(updatedContent.id, "f6")
    root.renderer.nativeSimulateKeystrokes(updatedContent.id, "f7")
    expect(resolved).toEqual([undefined, "arrangement.toggleAutomation"])
  } finally {
    root.unmount()
  }
})
