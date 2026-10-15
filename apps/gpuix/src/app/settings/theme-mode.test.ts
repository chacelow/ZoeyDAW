import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSettingStorage } from "@/platform/settings"
import { createThemeModeStore, resolveAppearance } from "./theme-mode"
import { createThemeModeSetting } from "./theme-mode-setting"
import type { ThemeMode, ThemeModeSetting } from "./theme-mode"

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function memorySetting(initial: string | null): ThemeModeSetting & { value: string | null } {
  const setting = {
    value: initial,
    get: () => setting.value,
    set: (mode: ThemeMode) => {
      setting.value = mode
    },
  }
  return setting
}

describe("theme mode store", () => {
  test("loads a stored mode, persists changes and notifies once per change", () => {
    const setting = memorySetting("light")
    const store = createThemeModeStore(setting)
    let notified = 0
    store.subscribe(() => notified++)
    expect(store.getMode()).toBe("light")
    store.setMode("dark")
    store.setMode("dark")
    expect(setting.value).toBe("dark")
    expect(createThemeModeStore(setting).getMode()).toBe("dark")
    expect(notified).toBe(1)
    expect(store.isPersisted()).toBe(true)
  })

  test("unknown stored values fall back to the default mode", () => {
    expect(createThemeModeStore(memorySetting("sepia")).getMode()).toBe("system")
    expect(createThemeModeStore(memorySetting(null)).getMode()).toBe("system")
  })

  test("a failing port keeps the choice in memory instead of throwing", () => {
    const store = createThemeModeStore({
      get: () => {
        throw new Error("unknown field `themeMode`")
      },
      set: () => {
        throw new Error("unknown field `themeMode`")
      },
    })
    expect(store.getMode()).toBe("system")
    expect(() => store.setMode("light")).not.toThrow()
    expect(store.getMode()).toBe("light")
    expect(store.isPersisted()).toBe(false)
  })

  test("system resolves to the native reading, or dark while none exists", () => {
    expect(resolveAppearance("system", null)).toBe("dark")
    expect(resolveAppearance("system", "light")).toBe("light")
    expect(resolveAppearance("light", "dark")).toBe("light")
  })
})

describe("real native settings port", () => {
  test("language persists through the Rust settings file", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-app-settings-"))
    directories.push(configDir)
    createSettingStorage("language", { configDir }).set("en-US")
    expect(createSettingStorage("language", { configDir }).get()).toBe("en-US")
    expect(JSON.parse(readFileSync(path.join(configDir, "settings.json"), "utf8"))).toEqual({
      language: "en-US",
    })
  })

  test("before H1 the Rust settings reject themeMode and the store degrades to memory", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-app-settings-"))
    directories.push(configDir)
    createSettingStorage("language", { configDir }).set("zh-CN")
    const store = createThemeModeStore(createThemeModeSetting({ configDir }))
    store.setMode("light")
    expect(store.getMode()).toBe("light")
    expect(store.isPersisted()).toBe(false)
    expect(createSettingStorage("language", { configDir }).get()).toBe("zh-CN")
  })
})
