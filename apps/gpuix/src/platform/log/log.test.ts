import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createLogPlatform, createNativeLogSink } from "./index"

const directories: string[] = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("real native log bridge", () => {
  test("writes through the logger sink, filters levels, and reopens after clearing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zoeydaw-log-napi-"))
    directories.push(root)
    const activeDir = path.join(root, "active")
    const configuredDir = path.join(root, "configured")
    const platform = createLogPlatform({
      configDir: path.join(root, "config"),
      defaultDir: activeDir,
    })
    expect(platform.initialize()).toBe(activeDir)
    platform.setLevel("info")
    const sink = createNativeLogSink()
    sink({ level: "warn", args: ["source", { clip: 1 }], timestamp: Date.now(), prefix: "project" })
    sink({ level: "debug", args: ["skip"], timestamp: Date.now() })
    const file = path.join(activeDir, "app.log")
    expect(readFileSync(file, "utf8")).toContain('[project] source {"clip":1}')
    expect(readFileSync(file, "utf8")).not.toContain("skip")
    platform.setDir(configuredDir)
    expect(platform.get().configuredDir).toBe(configuredDir)
    expect(platform.get().activeDir).toBe(activeDir)
    writeFileSync(path.join(activeDir, "keep.txt"), "keep")
    expect(platform.clear()).toBe(1)
    expect(existsSync(path.join(activeDir, "keep.txt"))).toBe(true)
    sink({ level: "error", args: ["after clear"], timestamp: Date.now() })
    expect(readFileSync(file, "utf8")).toContain("after clear")
    expect(platform.get().sizeBytes).toBeGreaterThan(0)
  })
})
