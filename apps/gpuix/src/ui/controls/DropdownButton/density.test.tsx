import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DropdownButton } from "."
import { ListRow } from "../ListRow"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../Menu"
import { CONTROL_METRICS } from "@/shared/theme/metrics/config"

test("popup rows share Browser row geometry independently of transport triggers", () => {
  for (const size of ["default", "transport"] as const) {
    const root = createTestRoot({ width: 640, height: 400 })
    try {
      root.render(
        <ThemeProvider>
          <div style={{ alignItems: "start" }}>
            <ListRow testId="browser-row" label="Resource" />
            <DropdownButton
              testId="density"
              label="Mode"
              size={size}
              value="a"
              onChange={() => {}}
              items={[{ id: "a", label: "Resource" }]}
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
      const browser = root.renderer.findByTestId("browser-row")!
      const trigger = root.renderer.findByTestId("density")!
      root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
      root.renderer.flush()
      const option = root.renderer.findByTestId("density-option-a")!
      if (size === "transport") {
        expect(root.renderer.getElementBounds(trigger.id)!.height).toBeGreaterThan(
          root.renderer.getElementBounds(browser.id)!.height
        )
      }
      for (const key of [
        "minHeight",
        "paddingLeft",
        "paddingRight",
        "gap",
        "fontSize",
        "borderWidth",
        "borderRadius",
      ] as const) {
        expect(option.style[key]).toBe(browser.style[key])
      }
      expect(root.renderer.getElementBounds(option.id)!.height).toBe(
        root.renderer.getElementBounds(browser.id)!.height
      )
      root.renderer.nativeSimulateKeystrokes(option.id, "escape")
      root.renderer.nativeSimulateKeystrokes(
        root.renderer.findByTestId("menu-trigger")!.id,
        "enter"
      )
      root.renderer.flush()
      const menu = root.renderer.findByTestId("menu-row")!
      for (const key of [
        "minHeight",
        "paddingLeft",
        "paddingRight",
        "gap",
        "fontSize",
        "borderWidth",
        "borderRadius",
      ] as const) {
        expect(menu.style[key]).toBe(browser.style[key])
      }
      expect(root.renderer.getElementBounds(menu.id)!.height).toBe(
        root.renderer.getElementBounds(browser.id)!.height
      )
    } finally {
      root.unmount()
    }
  }
})

for (const size of ["default", "transport"] as const) {
  for (const withIcon of [false, true]) {
    test(`longest dropdown label fits without surplus gap width: ${size}, icon=${withIcon}`, () => {
      const root = createTestRoot({ width: 900, height: 220 })
      const longest = "Tones preserves pitch with the longest available mode"
      try {
        root.render(
          <ThemeProvider>
            <div style={{ alignItems: "start" }}>
              <text
                testId="intrinsic-label"
                style={{
                  fontSize: CONTROL_METRICS[size]["--text-control-track"],
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {longest}
              </text>
              <DropdownButton
                testId="fitted-dropdown"
                label="Mode"
                size={size}
                value="long"
                icon={withIcon ? <text>+</text> : undefined}
                onChange={() => {}}
                items={[
                  { id: "short", label: "A" },
                  { id: "long", label: longest },
                ]}
              />
            </div>
          </ThemeProvider>
        )
        for (let pass = 0; pass < 6; pass++) {
          root.renderer.flush()
          root.renderer.dispatchNativeEvents()
        }
        const intrinsic = root.renderer.findByTestId("intrinsic-label")
        const value = root.renderer.findByTestId("fitted-dropdown-value")
        if (!intrinsic || !value) throw new Error("Missing dropdown label geometry")
        const intrinsicBounds = root.renderer.getElementBounds(intrinsic.id)
        const valueBounds = root.renderer.getElementBounds(value.id)
        if (!intrinsicBounds || !valueBounds) throw new Error("Missing native label bounds")
        expect(valueBounds.width).toBeGreaterThanOrEqual(intrinsicBounds.width)
        expect(valueBounds.width).toBe(Math.ceil(intrinsicBounds.width))
      } finally {
        root.unmount()
      }
    })
  }
}
