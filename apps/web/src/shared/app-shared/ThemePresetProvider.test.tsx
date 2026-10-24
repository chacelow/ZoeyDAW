// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { clearManagedKeys, THEME_PRESET_STORAGE_KEY, ThemeProvider, useTheme } from "@zoeymind/ui"
import { ThemePresetProvider } from "./ThemePresetProvider"
import { useThemePreset } from "./theme-preset-context"

function ThemeControls() {
  const { presetId, setPreset } = useThemePreset()
  const { setTheme } = useTheme()

  return (
    <>
      <output aria-label="Selected preset">{presetId || "Default"}</output>
      <button type="button" onClick={() => setTheme("dark")}>
        Dark mode
      </button>
      <button type="button" onClick={() => setPreset("vscode-plus")}>
        Select Plus
      </button>
    </>
  )
}

function renderTheme() {
  return render(
    <ThemeProvider defaultTheme="light">
      <ThemePresetProvider>
        <ThemeControls />
      </ThemePresetProvider>
    </ThemeProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }))
  )
})

afterEach(() => {
  cleanup()
  clearManagedKeys(document.documentElement)
  document.documentElement.classList.remove("dark")
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("ThemePresetProvider", () => {
  it("uses Modern when no preset has been saved", () => {
    const view = renderTheme()

    expect(view.getByRole("status", { name: "Selected preset" }).textContent).toBe("vscode-modern")
    expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.style.getPropertyValue("--foreground")).toBe(
      "hsl(0 0% 23.1373%)"
    )
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "hsl(209.0217 100% 36.0784%)"
    )
    fireEvent.click(view.getByRole("button", { name: "Dark mode" }))

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      "hsl(0 0% 12.1569%)"
    )
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "hsl(206.0377 100% 41.5686%)"
    )
    expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBeNull()
  })

  it("preserves an explicitly saved Default and clears managed preset styles", () => {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, "")
    document.documentElement.style.setProperty("--background", "hotpink")
    const view = renderTheme()

    expect(view.getByRole("status", { name: "Selected preset" }).textContent).toBe("Default")
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("")
    expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBe("")
  })

  it("preserves a previously saved non-VS-Code preset", () => {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, "modern-minimal")
    const view = renderTheme()

    expect(view.getByRole("status", { name: "Selected preset" }).textContent).toBe("modern-minimal")
    expect(document.documentElement.style.getPropertyValue("--foreground")).toBe("hsl(0 0% 20%)")
    expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBe("modern-minimal")
  })

  it.each([
    { preset: "vscode-modern", darkBackground: "hsl(0 0% 12.1569%)" },
    { preset: "vscode-plus", darkBackground: "hsl(0 0% 11.7647%)" },
    { preset: "modern-minimal", darkBackground: "hsl(0 0% 9.0196%)" },
  ])(
    "re-applies $preset when mode changes without replacing the selection",
    ({ preset, darkBackground }) => {
      window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset)
      const view = renderTheme()

      expect(document.documentElement.style.getPropertyValue("--background")).toBe("hsl(0 0% 100%)")
      fireEvent.click(view.getByRole("button", { name: "Dark mode" }))

      expect(document.documentElement.classList.contains("dark")).toBe(true)
      expect(document.documentElement.style.getPropertyValue("--background")).toBe(darkBackground)
      expect(view.getByRole("status", { name: "Selected preset" }).textContent).toBe(preset)
      expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBe(preset)
    }
  )

  it("persists a new selection and applies its dark palette after changing mode", () => {
    const view = renderTheme()
    fireEvent.click(view.getByRole("button", { name: "Select Plus" }))

    expect(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)).toBe("vscode-plus")
    expect(view.getByRole("status", { name: "Selected preset" }).textContent).toBe("vscode-plus")
    fireEvent.click(view.getByRole("button", { name: "Dark mode" }))
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      "hsl(0 0% 11.7647%)"
    )
  })
})
