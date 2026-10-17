import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DropdownButton } from "."
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../Menu"

test("menu and select rows keep the same single-line height independently of transport triggers", () => {
  for (const size of ["default", "transport"] as const) {
    const root = createTestRoot({ width: 640, height: 400 })
    try {
      root.render(
        <ThemeProvider>
          <div style={{ alignItems: "start" }}>
            <DropdownButton
              testId="density"
              label="Mode"
              size={size}
              value="a"
              onChange={() => {}}
              items={[{ id: "a", label: "Resource with a long label\nAnd a second line" }]}
            />
            <DropdownMenu>
              <DropdownMenuTrigger testId="menu-trigger">Menu</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem testId="menu-row">Resource</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ThemeProvider>
      )
      root.renderer.flush()
      const trigger = root.renderer.findByTestId("density")!
      root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
      root.renderer.flush()
      const option = root.renderer.findByTestId("density-option-a")!
      const optionHeight = root.renderer.getElementBounds(option.id)!.height
      if (size === "transport") {
        expect(root.renderer.getElementBounds(trigger.id)!.height).toBeGreaterThan(
          optionHeight
        )
      }
      root.renderer.nativeSimulateKeystrokes(option.id, "escape")
      root.renderer.nativeSimulateKeystrokes(
        root.renderer.findByTestId("menu-trigger")!.id,
        "enter"
      )
      root.renderer.flush()
      const menu = root.renderer.findByTestId("menu-row")!
      expect(root.renderer.getElementBounds(menu.id)!.height).toBe(
        optionHeight
      )
    } finally {
      root.unmount()
    }
  }
})
