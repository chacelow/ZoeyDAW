import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { checkFileSizes, collectSourceSizes, countLines } from "../../scripts/check-file-size.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it("counts physical lines consistently with and without a trailing newline", () => {
  expect(countLines("")).toBe(0)
  expect(countLines("one\ntwo")).toBe(2)
  expect(countLines("one\ntwo\n")).toBe(2)
  expect(countLines("\n\n")).toBe(2)
})

it("rejects new oversized files and growth beyond existing debt", () => {
  expect(checkFileSizes(new Map([["apps/a.ts", 800]]), {})).toEqual([])
  expect(checkFileSizes(new Map([["apps/a.ts", 801]]), {})).toHaveLength(1)
  expect(checkFileSizes(new Map([["apps/a.ts", 1001]]), { "apps/a.ts": 1000 })).toHaveLength(1)
  expect(checkFileSizes(new Map([["apps/a.ts", 900]]), { "apps/a.ts": 1000 })).toEqual([])
})

it("includes untracked tests and dictionaries but excludes vendor and generated sources", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zoeydaw-file-size-"))
  temporary.push(root)
  for (const file of [
    "apps/web/src/runtime.test.ts",
    "apps/web/src/locales/en.ts",
    "crates/engine/native/vendor/huge.cpp",
    "crates/engine/native/runtime/wire.generated.h",
    "packages/core/src/generated/types.ts",
    "apps/web/node_modules/library/index.js",
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), "line\n")
  }
  expect([...collectSourceSizes(root).keys()].sort((a, b) => a.localeCompare(b))).toEqual([
    "apps/web/src/locales/en.ts",
    "apps/web/src/runtime.test.ts",
  ])
})
