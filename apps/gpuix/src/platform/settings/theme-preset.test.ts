import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isThemePresetId } from "@/shared/theme/presets"
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

test("a listed preset round-trips through the real settings file beside other settings", () => {
  const configDir = temporaryDirectory()
  writeFileSync(settingsFile(configDir), '{"language":"zh-CN","closeBehavior":"ask"}')
  const preset = createThemePresetSetting(isThemePresetId, { configDir })
  expect(preset.get()).toBeNull()

  preset.set("catppuccin")
  expect(createThemePresetSetting(isThemePresetId, { configDir }).get()).toBe("catppuccin")
  expect(stored(configDir)).toEqual({
    themePreset: "catppuccin",
    language: "zh-CN",
    closeBehavior: "ask",
  })
})

test("an unlisted stored id reads as null without rewriting, and the next write replaces it", () => {
  const configDir = temporaryDirectory()
  for (const legacy of ["removed-preset", "", "dark", "constructor"]) {
    const before = JSON.stringify({ themePreset: legacy, language: "en-US" })
    writeFileSync(settingsFile(configDir), before)
    const preset = createThemePresetSetting(isThemePresetId, { configDir })
    expect({ legacy, read: preset.get() }).toEqual({ legacy, read: null })
    expect(readFileSync(settingsFile(configDir), "utf8")).toBe(before)

    preset.set("default")
    expect(stored(configDir)).toEqual({ themePreset: "default", language: "en-US" })
  }
})
