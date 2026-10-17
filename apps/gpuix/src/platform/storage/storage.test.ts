import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readBytes, resolveExternalHttpUrl, writeBytesAtomically } from "@zoeydaw/native"
import { createSettingStorage, createSettings } from "../settings"
import {
  createProjectFileStorage,
  createProjectLocations,
  createRecentProjectStorage,
} from "./index"

const paths: string[] = []
function temporaryDirectory() {
  const dir = mkdtempSync(path.join(tmpdir(), "zoeydaw-native-platform-"))
  paths.push(dir)
  return dir
}
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("real napi storage", () => {
  test("atomic replacement exposes a complete old or new file and removes temp files", () => {
    const dir = temporaryDirectory()
    const file = path.join(dir, "atomic.bin")
    writeFileSync(file, "complete old payload")
    const payload = Buffer.alloc(512 * 1024, 0x5a)
    writeBytesAtomically(file, payload)
    expect(Buffer.from(readBytes(file))).toEqual(payload)
    expect(readFileSync(file)).toEqual(payload)
    expect(readdirSync(dir)).toEqual(["atomic.bin"])
  })

  test("settings persist valid preferences and recent project paths", () => {
    const dir = temporaryDirectory()
    const settings = createSettings({ configDir: dir })
    settings.set({ language: "en-US", themePreset: "dark", closeBehavior: "tray" })
    const localeStorage: { get(): string | null; set(locale: string): void } = createSettingStorage(
      "language",
      { configDir: dir }
    )
    localeStorage.set("zh-CN")
    createRecentProjectStorage({ configDir: dir }).set([
      { path: "/a/A Project/A.zdaw", openedAt: 1 },
    ])
    expect(createSettings({ configDir: dir }).get()).toMatchObject({
      language: "zh-CN",
      themePreset: "dark",
      closeBehavior: "tray",
      recentProjects: [{ path: "/a/A Project/A.zdaw", openedAt: 1 }],
    })
  })

  test("project files save into their folder with rotating backups", () => {
    const dir = temporaryDirectory()
    const locations = createProjectLocations()
    const file = locations.filePath(dir, "Song")
    if (file === null) throw new Error("valid name rejected")
    expect(file).toBe(path.join(dir, "Song Project", "Song.zdaw"))
    expect(locations.filePath(dir, "a/b")).toBeNull()
    expect(locations.exists(file)).toBe(false)
    const files = createProjectFileStorage()
    expect(files.read(file)).toBeNull()
    files.write(file, '{"v":1}')
    files.write(file, '{"v":2}')
    expect(locations.exists(file)).toBe(true)
    expect(files.read(file)).toBe('{"v":2}')
    const backups = readdirSync(path.join(dir, "Song Project", "Backup"))
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(/^Song \[\d{4}-\d{2}-\d{2} \d{6}\]\.zdaw$/u)
  })

  test("only external HTTP URLs cross the opener boundary", () => {
    expect(resolveExternalHttpUrl("https://example.com/docs", "http://localhost/app")).toBe(
      "https://example.com/docs"
    )
    expect(resolveExternalHttpUrl("/settings", "http://localhost/app")).toBeNull()
    expect(resolveExternalHttpUrl("mailto:test@example.com", "http://localhost/app")).toBeNull()
    expect(resolveExternalHttpUrl("javascript:alert(1)")).toBeNull()
    expect(resolveExternalHttpUrl("file:///tmp/private")).toBeNull()
  })
})
