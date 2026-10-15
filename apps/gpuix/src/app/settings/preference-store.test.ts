import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSettingStorage } from "@/platform/settings"
import { createThemePresetSetting } from "@/platform/settings/theme-preset"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { createPreferenceStore } from "./preference-store"
import { DEFAULT_THEME_MODE, isThemeMode, resolveAppearance } from "./theme-mode"
import { createThemeModeSetting } from "./theme-mode-setting"
import type { PreferenceSetting } from "./preference-store"
import type { ThemeMode } from "./theme-mode"

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function configDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "zoeydaw-app-settings-"))
  directories.push(dir)
  return dir
}

function memorySetting(initial: string | null): PreferenceSetting<ThemeMode> & {
  value: string | null
} {
  const setting = {
    value: initial,
    get: () => setting.value,
    set: (mode: ThemeMode) => {
      setting.value = mode
    },
  }
  return setting
}

const modeStore = (setting: PreferenceSetting<ThemeMode>) =>
  createPreferenceStore(setting, isThemeMode, DEFAULT_THEME_MODE)

describe("preference store", () => {
  test("loads a stored value, persists changes and notifies once per change", () => {
    const setting = memorySetting("light")
    const store = modeStore(setting)
    let notified = 0
    store.subscribe(() => notified++)
    expect(store.get()).toBe("light")
    store.set("dark")
    store.set("dark")
    expect(setting.value).toBe("dark")
    expect(modeStore(setting).get()).toBe("dark")
    expect(notified).toBe(1)
    expect(store.isPersisted()).toBe(true)
  })

  test("unknown stored values fall back to the default", () => {
    expect(modeStore(memorySetting("sepia")).get()).toBe("system")
    expect(modeStore(memorySetting(null)).get()).toBe("system")
  })

  test("a failing port keeps the choice in memory instead of throwing", () => {
    const store = modeStore({
      get: () => {
        throw new Error("unknown field `themeMode`")
      },
      set: () => {
        throw new Error("unknown field `themeMode`")
      },
    })
    expect(store.get()).toBe("system")
    expect(() => store.set("light")).not.toThrow()
    expect(store.get()).toBe("light")
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
    const dir = configDir()
    createSettingStorage("language", { configDir: dir }).set("en-US")
    expect(createSettingStorage("language", { configDir: dir }).get()).toBe("en-US")
    expect(JSON.parse(readFileSync(path.join(dir, "settings.json"), "utf8"))).toEqual({
      language: "en-US",
    })
  })

  test("a chosen preset survives a restart; a stale id is repaired to Default", () => {
    const dir = configDir()
    const open = () => {
      const setting = createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET, {
        configDir: dir,
      })
      setting.repair()
      return createPreferenceStore(setting, isThemePresetId, DEFAULT_THEME_PRESET)
    }
    open().set("catppuccin")
    expect(open().get()).toBe("catppuccin")
    createSettingStorage("themePreset", { configDir: dir }).set("retired-preset")
    expect(open().get()).toBe(DEFAULT_THEME_PRESET)
    expect(createSettingStorage("themePreset", { configDir: dir }).get()).toBe(DEFAULT_THEME_PRESET)
  })

  test("before H1 the Rust settings reject themeMode and the store degrades to memory", () => {
    const dir = configDir()
    createSettingStorage("language", { configDir: dir }).set("zh-CN")
    const store = modeStore(createThemeModeSetting({ configDir: dir }))
    store.set("light")
    expect(store.get()).toBe("light")
    expect(store.isPersisted()).toBe(false)
    expect(createSettingStorage("language", { configDir: dir }).get()).toBe("zh-CN")
  })
})
