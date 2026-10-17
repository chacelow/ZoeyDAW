import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_THEME_PRESET, THEME_PRESETS } from "@/shared/theme/presets"
import { ModalDialog } from "../dialog/ModalDialog"
import { AppInteractionProvider } from "../interaction"
import { ThemePresetGrid } from "./ThemePresetGrid"
import type { TestRoot } from "@gpuix/react/testing"
import type { ThemePresetId } from "@/shared/theme/presets"

function Grid({ width = 420 }: { readonly width?: number }) {
  const [value, setValue] = useState<ThemePresetId>(DEFAULT_THEME_PRESET)
  return (
    <AppInteractionProvider>
      <ThemeProvider>
        <div style={{ width: "100%", height: "100%" }}>
          <ModalDialog open onOpenChange={() => {}} label="Presets">
            <div style={{ width }}>
              <ThemePresetGrid value={value} onValueChange={setValue} label="Presets" />
            </div>
          </ModalDialog>
        </div>
      </ThemeProvider>
    </AppInteractionProvider>
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

test("End/Home and Tab/Shift-Tab navigate presets without an inner scroll viewport", () => {
  const root = createTestRoot({ width: 800, height: 600 })
  try {
    root.render(<Grid />)
    const last = THEME_PRESETS.at(-1)
    const previous = THEME_PRESETS.at(-2)
    if (!last || !previous) throw new Error("The preset list needs multiple rows")
    const firstId = "theme-preset-default"
    const lastId = `theme-preset-${last.id}`
    const previousId = `theme-preset-${previous.id}`
    const grid = bounds(root, "theme-preset-grid")
    expect(grid.width).toBe(420)
    expect(bounds(root, lastId).y).toBeGreaterThan(bounds(root, firstId).y)
    const selected = node(root, firstId)
    const swatch = selected.children
      .map(id => root.renderer.getElement(id))
      .find(child => child?.style.position === "relative")
    const badge = swatch?.children
      .map(id => root.renderer.getElement(id))
      .find(child => child?.style.position === "absolute")
    if (!badge) throw new Error("Selected preset badge missing")
    const badgeBounds = root.renderer.getElementBounds(badge.id)
    if (!badgeBounds) throw new Error("Selected preset badge was not painted")
    expect(Number(badge.style.borderRadius)).toBe(badgeBounds.height / 2)

    root.renderer.nativeSimulateKeystrokes(node(root, firstId).id, "end")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expect(bounds(root, lastId).y).toBeGreaterThanOrEqual(grid.y)

    root.renderer.nativeSimulateKeystrokes(node(root, lastId).id, "shift-tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, previousId).id)
    expect(bounds(root, previousId).y).toBeGreaterThanOrEqual(grid.y)

    root.renderer.nativeSimulateKeystrokes(node(root, previousId).id, "tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expect(bounds(root, lastId).y).toBeGreaterThanOrEqual(grid.y)

    root.renderer.nativeSimulateKeystrokes(node(root, lastId).id, "home")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, firstId).id)
    expect(bounds(root, firstId).y).toBeGreaterThanOrEqual(grid.y)

    root.renderer.nativeSimulateKeystrokes(node(root, previousId).id, "tab")
    root.renderer.flush()
    expect(root.renderer.getFocusedElementId()).toBe(node(root, lastId).id)
    expect(bounds(root, lastId).y).toBeGreaterThanOrEqual(grid.y)
  } finally {
    root.unmount()
  }
})

test("preset swatches wrap to available native panel width without an inner scroll", () => {
  const root = createTestRoot({ width: 1200, height: 900 })
  try {
    root.render(<Grid width={800} />)
    const firstWide = bounds(root, `theme-preset-${THEME_PRESETS[0]?.id}`)
    const secondWide = bounds(root, `theme-preset-${THEME_PRESETS[1]?.id}`)
    expect(secondWide.y).toBe(firstWide.y)
    expect(secondWide.x).toBeGreaterThan(firstWide.x)
    root.render(<Grid width={200} />)
    const firstNarrow = bounds(root, `theme-preset-${THEME_PRESETS[0]?.id}`)
    const secondNarrow = bounds(root, `theme-preset-${THEME_PRESETS[1]?.id}`)
    expect(secondNarrow.y).toBeGreaterThan(firstNarrow.y)
    expect(root.renderer.findByTestId("theme-preset-scroll")).toBeUndefined()
  } finally {
    root.unmount()
  }
})

