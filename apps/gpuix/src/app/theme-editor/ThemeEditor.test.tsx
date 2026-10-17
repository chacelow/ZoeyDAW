import { expect, test } from "bun:test"
import { useState } from "react"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AppInteractionProvider } from "../interaction"
import { themeEditorTranslation } from "../locales/theme-editor"
import { ThemeEditor } from "./ThemeEditor"
import { EMPTY_THEME_LIBRARY } from "./model"
import type { ThemeLibrary } from "./model"

test("pasted VS Code JSON creates and activates a custom theme with include warning", () => {
  const root = createTestRoot({ width: 1000, height: 3000 })
  let latest: ThemeLibrary = EMPTY_THEME_LIBRARY
  function Harness() {
    const [library, setLibrary] = useState(EMPTY_THEME_LIBRARY)
    latest = library
    return (
      <AppInteractionProvider>
        <ThemeProvider>
          <ThemeEditor value={library} onChange={setLibrary} t={key => themeEditorTranslation(key, "en")} />
        </ThemeProvider>
      </AppInteractionProvider>
    )
  }
  try {
    root.render(<Harness />)
    const input = root.renderer.findByTestId("theme-editor-json")
    if (!input) throw new Error("Missing theme JSON input")
    flushSync(() => {
      handleGpuixEvent({
        elementId: input.id,
        eventType: "change",
        value: '{"name":"Imported palette","type":"dark","include":"base.json","colors":{"editor.background":"#282c34"}}',
      }, root.renderer)
    })
    const button = root.renderer.findByTestId("theme-editor-import-vscode")
    if (!button) throw new Error("Missing VS Code import action")
    root.renderer.nativeSimulateKeystrokes(button.id, "enter")
    expect(latest.themes).toHaveLength(1)
    const custom = latest.themes[0]
    if (!custom) throw new Error("Imported theme missing")
    expect(latest.selection).toBe(custom.id)
    expect(custom.colors.dark.background).toBe("#282c34")
    expect(custom.colors.light).toEqual({})
    expect(root.renderer.findByTestId(`theme-editor-select-${custom.id}`)).toBeDefined()
    expect(root.renderer.findByText(themeEditorTranslation("themeEditor.includeWarning", "en"))).toBeDefined()
  } finally {
    root.unmount()
  }
})
