import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "."
test("native Tab skips caller-excluded Button while AX preserves its requested role", () => {
  const root = createTestRoot({ width: 400, height: 100 })
  let activated = 0
  try {
    root.render(
      <ThemeProvider>
        <div style={{ display: "flex" }}>
          <div testId="before" role="button" tabIndex={0}>
            Before
          </div>
          <Button testId="excluded" role="menuitem" tabIndex={-1} label="Excluded action">
            Excluded
          </Button>
          <Button
            testId="default"
            label="Default action"
            onClick={() => {
              activated += 1
            }}
          >
            Default
          </Button>
          <div testId="after" role="button" tabIndex={0}>
            After
          </div>
        </div>
      </ThemeProvider>
    )
    root.renderer.flush()
    const before = root.renderer.findByTestId("before")!
    const normal = root.renderer.findByTestId("default")!
    const after = root.renderer.findByTestId("after")!
    root.renderer.focusElement(before.id)
    root.renderer.simulateKeystrokes("tab")
    expect(root.renderer.getFocusedElementId()).toBe(normal.id)
    root.renderer.simulateKeystrokes("enter")
    expect(activated).toBe(1)
    root.renderer.simulateKeystrokes("tab")
    expect(root.renderer.getFocusedElementId()).toBe(after.id)
    root.renderer.simulateKeystrokes("shift-tab")
    expect(root.renderer.getFocusedElementId()).toBe(normal.id)
    root.renderer.simulateKeystrokes("shift-tab")
    expect(root.renderer.getFocusedElementId()).toBe(before.id)
    root.renderer.flush()
    const semantics = Object.values(root.renderer.getA11yTree().nodes ?? {}).map(node => node.aria)
    expect(semantics.filter(node => node?.label === "Excluded action")).toEqual([
      expect.objectContaining({ role: "MenuItem" }),
    ])
    expect(semantics.filter(node => node?.label === "Default action")).toEqual([
      expect.objectContaining({ role: "Button" }),
    ])
  } finally {
    root.unmount()
  }
})
