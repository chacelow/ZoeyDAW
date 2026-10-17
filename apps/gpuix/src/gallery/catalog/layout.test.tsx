import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { LayoutSection } from "./layout"
import { createDisplayFormats } from "@/app/i18n/display-formats"

async function settle(root: TestRoot) {
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(35)
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
test("nested resizable demo keeps its mixer inside the full-height host", async () => {
  const root = createTestRoot({ width: 1400, height: 1200 })
  try {
    root.render(
      <ThemeProvider>
        <LayoutSection locale="en" t={en => en} formats={createDisplayFormats("en-US")} />
      </ThemeProvider>
    )
    await settle(root)
    const host = root.renderer.findByTestId("gallery-layouts-splits-host")
    const mixer = root.renderer.findByTestId("gallery-layouts-mixer-panel")
    const hostBox = host && root.renderer.getElementBounds(host.id)
    const mixerBox = mixer && root.renderer.getElementBounds(mixer.id)
    if (!hostBox || !mixerBox) throw new Error("Missing nested panel bounds")
    expect(mixerBox.height).toBeGreaterThan(0)
    expect(mixerBox.y + mixerBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height)
  } finally {
    root.unmount()
  }
})
test("Gallery routes K1 docking bindings through the command registry and restores hidden panels", async () => {
  const root = createTestRoot({ width: 1400, height: 1200 })
  try {
    root.render(
      <ThemeProvider>
        <LayoutSection locale="en" t={en => en} formats={createDisplayFormats("en-US")} />
      </ThemeProvider>
    )
    root.renderer.flush()
    await settle(root)
    const clip = root.renderer.findByTestId("gallery-dock-tab-Clip")
    if (!clip) throw new Error("Missing gallery Clip tab")
    root.renderer.nativeSimulateKeystrokes(clip.id, "enter")
    await settle(root)
    root.renderer.nativeSimulateKeystrokes(clip.id, "ctrl-alt-down")
    await settle(root)
    const moved = root.renderer.findByTestId("gallery-dock-tab-Clip")
    if (!moved) throw new Error("Missing moved Clip tab")
    root.renderer.nativeSimulateKeystrokes(moved.id, "ctrl-shift-enter")
    await settle(root)
    expect(root.renderer.findByTestId("gallery-dock-group-main")).toBeUndefined()
    const maximized = root.renderer.findByTestId("gallery-dock-tab-Clip")
    if (!maximized) throw new Error("Missing maximized Clip tab")
    root.renderer.nativeSimulateKeystrokes(maximized.id, "ctrl-shift-h")
    await settle(root)
    expect(root.renderer.findByTestId("gallery-dock-tab-Clip")).toBeUndefined()
    const reset = root.renderer.findByTestId("gallery-dock-reset")
    if (!reset) throw new Error("Missing reset")
    root.renderer.nativeSimulateKeystrokes(reset.id, "enter")
    await settle(root)
    expect(root.renderer.findByTestId("gallery-dock-tab-Clip")).toBeDefined()
  } finally {
    root.unmount()
  }
})
