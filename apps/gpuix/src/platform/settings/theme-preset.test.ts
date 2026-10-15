import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DEFAULT_THEME_PRESET, isThemePresetId } from "@/shared/theme/presets"
import { createSettingStorage } from "./index"
import { createThemePresetSetting } from "./theme-preset"

const paths: string[] = []
function temporaryDirectory() {
  const dir = mkdtempSync(path.join(tmpdir(), "zoeydaw-theme-preset-"))
  paths.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of paths.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const settingsFile = (dir: string) => path.join(dir, "settings.json")
const stored = (dir: string) => JSON.parse(readFileSync(settingsFile(dir), "utf8"))
const presetSetting = (configDir: string) =>
  createThemePresetSetting(isThemePresetId, DEFAULT_THEME_PRESET, { configDir })

test("a listed preset round-trips through the real settings file beside other settings", () => {
  const configDir = temporaryDirectory()
  writeFileSync(settingsFile(configDir), '{"language":"zh-CN","closeBehavior":"ask"}')
  const preset = presetSetting(configDir)
  expect(preset.get()).toBeNull()

  preset.set("catppuccin")
  expect(presetSetting(configDir).get()).toBe("catppuccin")
  expect(stored(configDir)).toEqual({
    themePreset: "catppuccin",
    language: "zh-CN",
    closeBehavior: "ask",
  })
})

test("an unlisted stored id reads as null without writing; repair replaces it with Default", () => {
  const configDir = temporaryDirectory()
  for (const legacy of ["removed-preset", "", "dark", "constructor"]) {
    const before = JSON.stringify({ themePreset: legacy, language: "en-US" })
    writeFileSync(settingsFile(configDir), before)
    const preset = presetSetting(configDir)
    expect({ legacy, read: preset.get() }).toEqual({ legacy, read: null })
    expect(readFileSync(settingsFile(configDir), "utf8")).toBe(before)

    // Another setting's write carries the stale id forward; only repair clears it.
    createSettingStorage("language", { configDir }).set("zh-CN")
    expect(stored(configDir).themePreset).toBe(legacy)
    expect({ legacy, repaired: preset.repair() }).toEqual({ legacy, repaired: true })
    expect(stored(configDir)).toEqual({ themePreset: DEFAULT_THEME_PRESET, language: "zh-CN" })
    expect(preset.get()).toBe(DEFAULT_THEME_PRESET)
  }
})

test("repair leaves a listed or missing preset untouched", () => {
  const configDir = temporaryDirectory()
  const preset = presetSetting(configDir)
  writeFileSync(settingsFile(configDir), '{"language":"en-US"}')
  expect(preset.repair()).toBe(false)
  expect(readFileSync(settingsFile(configDir), "utf8")).toBe('{"language":"en-US"}')

  preset.set("catppuccin")
  const before = readFileSync(settingsFile(configDir), "utf8")
  expect(preset.repair()).toBe(false)
  expect(readFileSync(settingsFile(configDir), "utf8")).toBe(before)
})
