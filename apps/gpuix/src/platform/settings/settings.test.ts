import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { settingsSet } from "@zoeydaw/native"
import { createSettingStorage, createSettings } from "./index"

const paths: string[] = []
function temporaryDirectory() {
  const dir = mkdtempSync(path.join(tmpdir(), "zoeydaw-theme-mode-"))
  paths.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of paths.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("themeMode setting through the real napi module", () => {
  test("legacy files without themeMode stay readable and the mode persists beside the preset", () => {
    const configDir = temporaryDirectory()
    writeFileSync(
      path.join(configDir, "settings.json"),
      '{"themePreset":"amber","language":"zh-CN","closeBehavior":"ask"}'
    )
    const themeMode = createSettingStorage("themeMode", { configDir })
    expect(themeMode.get()).toBeNull()

    themeMode.set("dark")
    expect(createSettings({ configDir }).get()).toEqual({
      themePreset: "amber",
      themeMode: "dark",
      language: "zh-CN",
      closeBehavior: "ask",
    })
    themeMode.set("system")
    expect(createSettingStorage("themeMode", { configDir }).get()).toBe("system")
  })

  test("unknown modes are rejected without replacing the stored file", () => {
    const configDir = temporaryDirectory()
    const settings = createSettings({ configDir })
    settings.set({ themeMode: "light" })
    const before = readFileSync(path.join(configDir, "settings.json"), "utf8")
    expect(() => settingsSet(configDir, '{"themeMode":"sepia"}')).toThrow(/sepia/)
    expect(readFileSync(path.join(configDir, "settings.json"), "utf8")).toBe(before)

    writeFileSync(path.join(configDir, "settings.json"), '{"themeMode":"auto"}')
    expect(() => settings.get()).toThrow(/auto/)
  })
})
