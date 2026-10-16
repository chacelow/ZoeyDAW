import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readBytes, resolveExternalHttpUrl, writeBytesAtomically } from "@zoeydaw/native"
import { createSettingStorage, createSettings } from "../settings"
import { createSnapshotStorage } from "./index"

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

  test("settings persist valid preferences and snapshots isolate routes", () => {
    const dir = temporaryDirectory()
    const settings = createSettings({ configDir: dir })
    settings.set({ language: "en-US", themePreset: "dark", closeBehavior: "tray" })
    expect(createSettings({ configDir: dir }).get()).toMatchObject({
      language: "en-US",
      themePreset: "dark",
      closeBehavior: "tray",
    })
    const localeStorage: { get(): string | null; set(locale: string): void } = createSettingStorage(
      "language",
      { configDir: dir }
    )
    localeStorage.set("zh-CN")
    expect(localeStorage.get()).toBe("zh-CN")
    expect(createSettings({ configDir: dir }).get()).toMatchObject({
      language: "zh-CN",
      themePreset: "dark",
      closeBehavior: "tray",
    })
    const snapshots = createSnapshotStorage({ dataDir: dir })
    expect(snapshots.get("project_2")).toBeNull()
    snapshots.set("project_1", '{"clips":[]}')
    snapshots.set("project_2", '{"clips":[1]}')
    expect(createSnapshotStorage({ dataDir: dir }).get("project_1")).toBe('{"clips":[]}')
    expect(snapshots.get("project_2")).toBe('{"clips":[1]}')
    snapshots.set("../escape", "{}")
    expect(snapshots.get("../escape")).toBe("{}")
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
