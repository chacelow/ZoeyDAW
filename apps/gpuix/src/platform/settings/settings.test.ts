import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { preferencesDefaults, settingsDefaults, settingsSet } from "@zoeydaw/native"
import { PREFERENCE_DEFAULTS as PURE_DEFAULTS } from "@/project/defaults/preferences"
import {
  configurePreferences,
  createPreferenceOwner,
  createSettingStorage,
  createSettings,
  getPreference,
  getPreferences,
  PREFERENCE_DEFAULTS,
} from "./index"

const paths: string[] = []
function temporaryDirectory() {
  const dir = mkdtempSync(path.join(tmpdir(), "zoeydaw-settings-"))
  paths.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of paths.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("versioned settings through the real napi module", () => {
  test("legacy files migrate in memory and preserve appearance beside preferences", () => {
    const configDir = temporaryDirectory()
    const file = path.join(configDir, "settings.json")
    const legacy = '{"themePreset":"amber","language":"zh-CN","closeBehavior":"ask"}'
    writeFileSync(file, legacy)
    const themeMode = createSettingStorage("themeMode", { configDir })
    expect(themeMode.get()).toBeNull()
    expect(createSettings({ configDir }).get()).toEqual({
      ...settingsDefaults(),
      themePreset: "amber",
      language: "zh-CN",
      closeBehavior: "ask",
    })
    expect(readFileSync(file, "utf8")).toBe(legacy)

    themeMode.set("dark")
    expect(createSettings({ configDir }).get()).toEqual({
      ...settingsDefaults(),
      themePreset: "amber",
      themeMode: "dark",
      language: "zh-CN",
      closeBehavior: "ask",
    })
    themeMode.set("system")
    expect(createSettingStorage("themeMode", { configDir }).get()).toBe("system")
  })

  test("unknown modes and future versions never replace the original bytes", () => {
    const configDir = temporaryDirectory()
    const settings = createSettings({ configDir })
    settings.set({ themeMode: "light" })
    const file = path.join(configDir, "settings.json")
    const before = readFileSync(file, "utf8")
    for (const input of ['{"themeMode":"sepia"}', '{"schemaVersion":2}']) {
      expect(() => settingsSet(configDir, input)).toThrow()
      expect(readFileSync(file, "utf8")).toBe(before)
    }

    const future = '{"schemaVersion":2,"futureSetting":true}'
    writeFileSync(file, future)
    expect(() => settings.get()).toThrow(/schemaVersion 2/)
    expect(() => settings.set({ language: "en-US" })).toThrow(/schemaVersion 2/)
    expect(readFileSync(file, "utf8")).toBe(future)
    writeFileSync(file, '{"themeMode":"auto"}')
    expect(() => settings.get()).toThrow(/auto/)
  })

  test("Rust schema defaults fully match the pure shared policy source", () => {
    expect(preferencesDefaults()).toEqual(PURE_DEFAULTS)
    expect(PREFERENCE_DEFAULTS).toEqual(PURE_DEFAULTS)
    expect(settingsDefaults().preferences).toEqual(PURE_DEFAULTS)
  })

  test("module import and owner construction do not read user settings", () => {
    const moduleUrl = new URL("./index.ts", import.meta.url).href
    // Dynamic import is intentional: the spies must exist before module initialization.
    const script = `
      import { spyOn } from "bun:test";
      import * as native from "@zoeydaw/native";
      spyOn(native, "settingsGet").mockImplementation(() => { throw new Error("eager read"); });
      spyOn(native, "userDirectories").mockImplementation(() => { throw new Error("eager directory lookup"); });
      const settings = await import(${JSON.stringify(moduleUrl)});
      settings.createSettings();
      settings.createPreferenceOwner();
    `
    const result = spawnSync(process.execPath, ["--eval", script], {
      cwd: import.meta.dir,
      encoding: "utf8",
    })
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" })
  })
})

describe("single preference owner", () => {
  test("loads lazily, isolates config directories, and publishes one stable snapshot", () => {
    const configDir = path.join(temporaryDirectory(), "not-created")
    const owner = createPreferenceOwner({ configDir })
    expect(existsSync(configDir)).toBe(false)
    const browser = owner.getPreference("browser")
    expect(browser).toEqual(PURE_DEFAULTS.browser)
    expect(owner.getPreference("browser")).toBe(browser)
    expect(owner.getPreferences().browser).toBe(browser)
    expect(existsSync(configDir)).toBe(false)
    expect(Object.isFrozen(browser)).toBe(true)
    expect(Object.isFrozen(browser.favorites)).toBe(true)

    let notifications = 0
    const unsubscribe = owner.subscribe(() => notifications++)
    owner.setPreference("browser", { ...browser, descending: true, libraryRoots: ["library"] })
    expect(notifications).toBe(1)
    owner.setPreference("browser", owner.getPreference("browser"))
    expect(notifications).toBe(1)
    expect(owner.getPreference("browser").descending).toBe(true)
    expect(createPreferenceOwner({ configDir }).getPreference("browser")).toEqual(
      owner.getPreference("browser")
    )
    const other = createPreferenceOwner({ configDir: temporaryDirectory() })
    expect(other.getPreference("browser").descending).toBe(false)
    unsubscribe()
    owner.setPreference("historyCapacity", 101)
    expect(notifications).toBe(1)
  })

  test("validates before publishing and preserves separately saved appearance", () => {
    const configDir = temporaryDirectory()
    const owner = createPreferenceOwner({ configDir })
    owner.setPreference("historyCapacity", 50)
    createSettingStorage("language", { configDir }).set("zh-CN")
    const initial = owner.getPreferences()
    const file = path.join(configDir, "settings.json")
    const original = readFileSync(file, "utf8")
    let notifications = 0
    owner.subscribe(() => notifications++)
    for (const value of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => owner.setPreference("historyCapacity", value)).toThrow()
      expect(owner.getPreferences()).toBe(initial)
      expect(readFileSync(file, "utf8")).toBe(original)
      expect(notifications).toBe(0)
    }
    owner.setPreference("audioDevice", { sampleRate: 44_100, blockFrames: 128 })
    expect(createSettings({ configDir }).get().language).toBe("zh-CN")
    expect(createSettings({ configDir }).get().preferences.audioDevice).toEqual({
      sampleRate: 44_100,
      blockFrames: 128,
    })
    expect(notifications).toBe(1)
  })

  test("sparse arrangement overrides persist without introducing policy defaults", () => {
    const configDir = temporaryDirectory()
    const owner = createPreferenceOwner({ configDir })
    expect(owner.getPreference("arrangement")).toBeUndefined()
    owner.setPreference("arrangement", {
      zoom: { stepInFactor: 2 },
      keyboard: { velocityStep: 17 },
    })
    const sparse = owner.getPreference("arrangement")
    expect(sparse).toEqual({ zoom: { stepInFactor: 2 }, keyboard: { velocityStep: 17 } })
    expect(createSettings({ configDir }).get().preferences.arrangement).toEqual(sparse)
    const file = path.join(configDir, "settings.json")
    const original = readFileSync(file, "utf8")
    expect(() => owner.setPreference("arrangement", { follow: { anchorRatio: 2 } })).toThrow()
    expect(owner.getPreference("arrangement")).toBe(sparse)
    expect(readFileSync(file, "utf8")).toBe(original)
    const settings = createSettings({ configDir }).get()
    expect(() =>
      settingsSet(
        configDir,
        JSON.stringify({
          ...settings,
          preferences: { ...settings.preferences, arrangement: { zoom: { unknown: 1 } } },
        })
      )
    ).toThrow()
    expect(readFileSync(file, "utf8")).toBe(original)
  })

  test("composition registration routes all reads through one isolated owner", () => {
    const first = createPreferenceOwner({ configDir: temporaryDirectory() })
    const second = createPreferenceOwner({ configDir: temporaryDirectory() })
    first.setPreference("historyCapacity", 71)
    second.setPreference("historyCapacity", 93)
    const releaseFirst = configurePreferences(first)
    const releaseSecond = configurePreferences(second)
    try {
      expect(getPreference("historyCapacity")).toBe(93)
      expect(getPreferences()).toBe(second.getPreferences())
      releaseFirst()
      expect(getPreferences()).toBe(second.getPreferences())
      releaseSecond()
      expect(getPreference("historyCapacity")).toBe(71)
    } finally {
      releaseSecond()
      releaseFirst()
    }
  })
})
