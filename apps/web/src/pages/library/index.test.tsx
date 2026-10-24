// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { I18nProvider, initI18n } from "@zoeymind/i18n"
import { ThemeProvider } from "@zoeymind/ui"
import { ThemePresetProvider } from "@/shared/app-shared"
import { appLocales } from "@/locales"
import { ComponentLibraryPage } from "./index"

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")
beforeEach(async () => {
  window.localStorage.clear()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() })
  await initI18n(appLocales).changeLanguage("en-US")
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
  window.localStorage.clear()
})

function renderLibrary() {
  return render(
    <MemoryRouter>
      <I18nProvider resources={appLocales}>
        <ThemeProvider defaultTheme="light">
          <ThemePresetProvider>
            <ComponentLibraryPage />
          </ThemePresetProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  )
}

describe("component-family Gallery navigation", () => {
  it("shows one linked family at a time and separates Radio, ToggleGroup and Toggle", () => {
    renderLibrary()
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
    expect(screen.getByRole("tab", { name: "Button" }).getAttribute("aria-selected")).toBe("true")
    for (const name of [
      "Radio",
      "ToggleGroup",
      "Toggle",
      "Number",
      "Bar",
      "Bipolar",
      "Pan",
      "Knobs",
      "Meters",
      "Faders",
      "Tracks",
      "Groups",
      "Clips",
      "Audio editor",
      "Piano roll",
      "Automation",
      "Devices",
      "Selected-track clip editor",
    ]) {
      expect(screen.getByRole("tab", { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole("tab", { name: "Number" }))
    const panel = screen.getByRole("tabpanel", { name: "Number" })
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1)
    expect(within(panel).getByRole("button", { name: "BPM" })).toBeTruthy()
    expect(within(panel).queryByRole("button", { name: "Volume" })).toBeNull()
    expect(panel.id).toBe(screen.getByRole("tab", { name: "Number" }).getAttribute("aria-controls"))
    const checklist = panel.querySelector("details[data-state-catalog]")
    expect(checklist?.hasAttribute("open")).toBe(false)
  })

  it("preserves the real edited numeric value, mounted control and sizing samples across family changes", () => {
    renderLibrary()
    fireEvent.click(screen.getByRole("tab", { name: "Number" }))
    const bpm = screen.getByRole("button", { name: "BPM" })
    bpm.focus()
    fireEvent.click(bpm, { detail: 0 })
    fireEvent.keyDown(bpm, { key: "1" })
    const input = screen.getByRole("textbox", { name: "BPM" })
    fireEvent.change(input, { target: { value: "153.25" } })
    fireEvent.keyDown(input, { key: "Enter" })
    const committed = screen.getByRole("button", { name: "BPM" })
    const samples = [...committed.querySelectorAll("[aria-hidden]")].map(node => node.textContent)
    expect(committed.textContent).toContain("153.25")
    fireEvent.click(screen.getByRole("tab", { name: "Inputs" }))
    const numericPanel = document.getElementById("gallery-panel-numbers")
    expect(numericPanel?.getAttribute("aria-hidden")).toBe("true")
    expect(numericPanel?.hasAttribute("inert")).toBe(true)
    expect(numericPanel?.style.opacity).toBe("0")
    expect(numericPanel?.style.visibility).toBe("hidden")
    expect(numericPanel?.style.position).toBe("absolute")
    fireEvent.click(screen.getByRole("tab", { name: "Number" }))
    const restored = screen.getByRole("button", { name: "BPM" })
    expect(restored).toBe(committed)
    expect(restored.textContent).toContain("153.25")
    expect([...restored.querySelectorAll("[aria-hidden]")].map(node => node.textContent)).toEqual(
      samples
    )
  })

  it("moves sidebar focus and selection with arrows, Home and End and mounts only the active production frame", () => {
    renderLibrary()
    const buttonTab = screen.getByRole("tab", { name: "Button" })
    buttonTab.focus()
    fireEvent.keyDown(buttonTab, { key: "ArrowDown" })
    const numberTab = screen.getByRole("tab", { name: "Number" })
    expect(document.activeElement).toBe(numberTab)
    expect(numberTab.getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(numberTab, { key: "End" })
    const editorTab = screen.getByRole("tab", { name: "Selected-track clip editor" })
    expect(document.activeElement).toBe(editorTab)
    expect(screen.getByRole("tabpanel", { name: "Selected-track clip editor" }).id).toBe(
      editorTab.getAttribute("aria-controls")
    )
    expect(document.querySelectorAll("iframe[data-gallery-preview]")).toHaveLength(1)
    expect(screen.getByTitle("Selected-track clip editor").getAttribute("src")).toContain(
      "/library/preview/track-editor?locale=en-US&mode=light&preset="
    )
    fireEvent.keyDown(editorTab, { key: "Home" })
    expect(document.activeElement).toBe(buttonTab)
    expect(buttonTab.getAttribute("aria-selected")).toBe("true")
    expect(document.querySelectorAll("iframe[data-gallery-preview]")).toHaveLength(0)
    fireEvent.keyDown(buttonTab, { key: "ArrowUp" })
    expect(document.activeElement).toBe(editorTab)
  })
})
