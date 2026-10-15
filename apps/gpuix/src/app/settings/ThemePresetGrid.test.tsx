import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_THEME_PRESET, THEME_PRESETS } from "@/shared/theme/presets"
import { ModalDialog } from "../dialog/ModalDialog"
import { ThemePresetGrid } from "./ThemePresetGrid"
import type { TestRoot } from "@gpuix/react/testing"
import type { ThemePresetId } from "@/shared/theme/presets"

function Grid() {
  const [value, setValue] = useState<ThemePresetId>(DEFAULT_THEME_PRESET)
  return (
    <ThemeProvider>
      <div style={{ width: "100%", height: "100%" }}>
        <ModalDialog open onOpenChange={() => {}} label="Presets">
          <div style={{ width: 420 }}>
            <ThemePresetGrid value={value} onValueChange={setValue} label="Presets" />
          </div>
        </ModalDialog>
      </div>
    </ThemeProvider>
  )
}

function node(root: TestRoot, id: string) {
  const element = root.renderer.findByTestId(id)
  if (!element) throw new Error(`Missing ${id}`)
  return element
}

function bounds(root: TestRoot, id: string) {
  const box = root.renderer.getElementBounds(node(root, id).id)
  if (!box) throw new Error(`Missing ${id} bounds`)
  return box
}

function expectVisible(root: TestRoot, id: string) {
  const viewport = bounds(root, "theme-preset-scroll")
  const item = bounds(root, id)
  expect(item.y).toBeGreaterThanOrEqual(viewport.y)
  expect(item.y + item.height).toBeLessThanOrEqual(viewport.y + viewport.height)
}

test("End/Home and Tab/Shift-Tab keep the focused preset inside the scroll viewport", () => {
  const root = createTestRoot({ width: 800, height: 600 })
  try {
    root.render(<Grid />)
    const last = THEME_PRESETS.at(-1)
    const previous = THEME_PRESETS.at(-2)
    if (!last || !previous) throw new Error("The preset list needs multiple rows")
    const firstId = "theme-preset-default"
    const lastId = `theme-preset-${last.id}`
    const previousId = `theme-preset-${previous.id}`
    const viewport = bounds(root, "theme-preset-scroll")
    expect(bounds(root, lastId).y).toBeGreaterThan(viewport.y + viewport.height)

    root.renderer.nativeSimulateKeystrokes(node(root, firstId).id, "end")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expectVisible(root, lastId)

    root.renderer.nativeSimulateKeystrokes(node(root, lastId).id, "shift-tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, previousId).id)
    expectVisible(root, previousId)

    root.renderer.nativeSimulateKeystrokes(node(root, previousId).id, "tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expectVisible(root, lastId)

    root.renderer.nativeSimulateKeystrokes(node(root, lastId).id, "home")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, firstId).id)
    expectVisible(root, firstId)

    // Native focusing alone does not scroll. Tab from a clipped item must reveal its target.
    root.renderer.nativeSimulateKeystrokes(node(root, previousId).id, "tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expectVisible(root, lastId)
  } finally {
    root.unmount()
  }
})

test("native wheel scrolling reveals later preset rows", () => {
  const root = createTestRoot({ width: 800, height: 600 })
  try {
    root.render(<Grid />)
    const scroll = node(root, "theme-preset-scroll")
    const viewport = bounds(root, "theme-preset-scroll")
    root.renderer.nativeSimulateScrollWheel(
      viewport.x + viewport.width / 2,
      viewport.y + viewport.height / 2,
      0,
      -500
    )
    root.renderer.flush()
    const offset = root.renderer.getScrollOffset(scroll.id)
    expect(offset?.[1]).toBeLessThan(0)
    expect(bounds(root, "theme-preset-default").y).toBeLessThan(viewport.y)
  } finally {
    root.unmount()
  }
})
