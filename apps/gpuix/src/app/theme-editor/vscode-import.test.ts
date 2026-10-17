import { expect, test } from "bun:test"
import { getThemePreset } from "@/shared/theme/presets"
import { resolveThemeOverrides } from "./model"
import { importVSCodeTheme } from "./vscode-import"

const identity = { id: "custom:import-test", fallbackName: "Imported" } as const

// https://github.com/Binaryify/OneDark-Pro/blob/master/themes/OneDark-Pro.json
const oneDarkPro = `{
  // Workbench colors from One Dark Pro; syntax highlighting intentionally omitted.
  "name": "One Dark Pro",
  "type": "dark",
  "include": "./base.json",
  "colors": {
    "button.background": "#404754",
    "editor.background": "#282c34",
    "editor.foreground": "#abb2bf",
    "editorGutter.addedBackground": "#109868",
    "focusBorder": "#3e4452",
    "list.activeSelectionBackground": "#2c313a",
    "list.activeSelectionForeground": "#d7dae0",
    "menu.foreground": "#abb2bf",
    "panel.border": "#3e4452",
    "sideBar.background": "#21252b",
    "sideBar.foreground": "#abb2bf",
    "tab.inactiveBackground": "#21252b",
  },
  /* Supported JSONC block comment and trailing array comma. */
  "tokenColors": [{ "scope": "comment", "settings": { "foreground": "#ff0000" } },],
}`

test("real community JSONC maps workbench colors and preserves the opposite scheme", () => {
  const result = importVSCodeTheme(oneDarkPro, identity)
  if (!result.ok) throw new Error("Community theme failed to import")
  expect(result.unresolvedInclude).toBe(true)
  expect(result.theme.name).toBe("One Dark Pro")
  expect(result.theme.basePreset).toBe("vscode-modern")
  expect(result.theme.colors.light).toEqual({})
  expect(result.theme.colors.dark).toEqual({
    primary: "#404754",
    background: "#282c34",
    foreground: "#abb2bf",
    success: "#109868",
    ring: "#3e4452",
    accent: "#2c313a",
    accentForeground: "#d7dae0",
    popoverForeground: "#abb2bf",
    border: "#3e4452",
    card: "#21252b",
    cardForeground: "#abb2bf",
    muted: "#21252b",
  })
  const library = { selection: result.theme.id, themes: [result.theme] }
  expect(resolveThemeOverrides(library, "dark").colors.input).toBe(
    getThemePreset("vscode-modern").baseColors.dark.input
  )
  expect(resolveThemeOverrides(library, "light").colors).toEqual(
    getThemePreset("vscode-modern").colors.light
  )
})

test.each(["dark", "light", "hc", "hcDark", "hcLight"])("imports %s into only its appearance", type => {
  const result = importVSCodeTheme(JSON.stringify({ type, colors: { "editor.background": "#123456" } }), identity)
  if (!result.ok) throw new Error("Theme failed to import")
  const scheme = type === "light" || type === "hcLight" ? "light" : "dark"
  expect(result.theme.colors[scheme].background).toBe("#123456")
  expect(result.theme.colors[scheme === "light" ? "dark" : "light"]).toEqual({})
})

test("infers omitted type, keeps strings intact and chooses first valid mapped token", () => {
  const result = importVSCodeTheme(`{
    "name": "https://example.test/*not a comment*/,]",
    "colors": { "editor.background": "#fff", "editor.foreground": "invalid", "foreground": "#222" },
  }`, identity)
  if (!result.ok) throw new Error("Theme failed to import")
  expect(result.theme.name).toBe("https://example.test/*not a comment*/,]")
  expect(result.theme.colors.light).toEqual({ background: "#fff", foreground: "#222", cardForeground: "#222", popoverForeground: "#222", secondaryForeground: "#222" })
  expect(result.unresolvedInclude).toBe(false)
})

test.each(["{bad", "{ /* unclosed", "[]", "null", "{}", '{"colors": []}', '{"type":"unknown","colors":{}}', '{"colors":{,}}', '{"colors":{},"tokenColors":[,]}', '{"colors":{},"include":42}'])("rejects malformed input: %s", json => {
  expect(importVSCodeTheme(json, identity)).toEqual({ ok: false })
})

test("unresolved include-only theme imports without attempting filesystem access", () => {
  const result = importVSCodeTheme('{"include":"../base.json"}', identity)
  if (!result.ok) throw new Error("Include-only theme failed to import")
  expect(result.unresolvedInclude).toBe(true)
  expect(result.theme.colors).toEqual({ dark: {}, light: {} })
})
