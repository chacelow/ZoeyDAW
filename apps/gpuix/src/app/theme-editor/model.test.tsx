import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "@/ui/controls"
import { createSettingStorage } from "@/platform/settings"
import { getThemePreset } from "@/shared/theme/presets"
import { createThemeLibraryStore } from "./store"
import {
  activeCustomTheme,
  deleteCustomTheme,
  duplicateCurrentTheme,
  EMPTY_THEME_LIBRARY,
  importCustomTheme,
  parseThemeLibrary,
  resolveThemeOverrides,
  setThemeField,
  updateCustomTheme,
} from "./model"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
test("preset color, shape and control overrides reach real rendered button geometry", () => {
  let library = duplicateCurrentTheme({ selection: "catppuccin", themes: [] }, "Custom palette")
  const original = activeCustomTheme(library)!
  let custom = setThemeField(original, "colors.dark.primary", "rgb(200, 40, 80)")
  custom = setThemeField(custom, "design.shape.controlRadius", 6)
  custom = setThemeField(custom, "control.default.--spacing-control-track", 30)
  library = updateCustomTheme(library, custom)
  const resolved = resolveThemeOverrides(library, "dark")
  expect(resolved.colors.primary).toBe("rgb(200, 40, 80)")
  expect(resolved.colors.background).toBe(getThemePreset("catppuccin").baseColors.dark.background)
  const root = createTestRoot({ width: 240, height: 100 })
  try {
    root.render(
      <ThemeProvider {...resolved}>
        <Button variant="link" testId="preview">Preview</Button>
      </ThemeProvider>
    )
    const node = root.renderer.findByTestId("preview")!
    expect(root.renderer.getElementBounds(node.id)?.height).toBe(30)
    expect(node.style.borderRadius).toBe(6)
    expect(node.style.color).toBe("rgb(200, 40, 80)")
  } finally {
    root.unmount()
  }
})
test("JSON boundary drops invalid color, nonfinite and out-of-range fields and rejects invalid metadata", () => {
  expect(importCustomTheme("{bad")).toBeNull()
  expect(
    importCustomTheme(JSON.stringify({ id: "custom:bad", name: "Bad", basePreset: "missing" }))
  ).toBeNull()
  const custom = importCustomTheme(
    JSON.stringify({
      id: "custom:test",
      name: "Test",
      basePreset: "catppuccin",
      colors: { dark: { primary: "not-a-color", foreground: "oklch(80% 0.1 50)" } },
      design: {
        shape: { controlRadius: -1, controlBorderWidth: 3 },
        states: { disabledOpacity: 2 },
      },
      control: { default: { "--spacing-control-track": 50000 } },
      project: { panelGap: "7" },
    })
  )!
  expect(custom.colors.dark.primary).toBeUndefined()
  expect(custom.colors.dark.foreground).toBe("oklch(80% 0.1 50)")
  expect(custom.design.shape?.controlRadius).toBeUndefined()
  expect(custom.design.shape?.controlBorderWidth).toBe(3)
  expect(custom.design.states?.disabledOpacity).toBeUndefined()
  expect(custom.control.default["--spacing-control-track"]).toBeUndefined()
  expect(custom.project.panelGap).toBeUndefined()
  const nonfinite = importCustomTheme(
    '{"id":"custom:overflow","name":"Overflow","basePreset":"default","project":{"panelGap":1e999}}'
  )
  expect(nonfinite?.project.panelGap).toBeUndefined()
  expect(
    parseThemeLibrary(JSON.stringify({ selection: "custom:missing", themes: [null, custom] }))
      .selection
  ).toBe("default")
})
test("real settings save and reloaded theme store resolve identically; deleting active falls back to base", () => {
  const configDir = mkdtempSync(path.join(tmpdir(), "custom-themes-"))
  directories.push(configDir)
  const storage = createSettingStorage("themeLibrary", { configDir })
  const first = createThemeLibraryStore(storage)
  const library = duplicateCurrentTheme(
    { ...EMPTY_THEME_LIBRARY, selection: "catppuccin" },
    "My palette"
  )
  const custom = setThemeField(activeCustomTheme(library)!, "project.defaultTrackHeight", 92)
  first.set(updateCustomTheme(library, custom))
  const reloaded = createThemeLibraryStore(storage)
  expect(reloaded.isPersisted()).toBe(true)
  expect(resolveThemeOverrides(reloaded.get(), "light")).toEqual(
    resolveThemeOverrides(first.get(), "light")
  )
  reloaded.set(deleteCustomTheme(reloaded.get(), custom.id))
  expect(createThemeLibraryStore(storage).get()).toEqual({ selection: "catppuccin", themes: [] })
})
