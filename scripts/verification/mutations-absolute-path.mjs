import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const root = mkdtempSync(path.join(os.tmpdir(), "gpuix-absolute-mutation-"))
try {
  for (const file of [
    "scripts/gpuix-review-scan.mjs",
    "scripts/verification/absolute-path-fixture.mjs",
    "scripts/verification/absolute-path.test.mjs",
  ]) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(path.join(projectRoot, file), target)
  }
  symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir")
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n')
  const scanner = path.join(root, "scripts/gpuix-review-scan.mjs")
  const original = readFileSync(scanner, "utf8")
  const disabled = original.replace('  "absolute-path",\n', "")
  if (disabled === original)
    throw new Error("Could not disable the scanner's HARD absolute-path classification")
  writeFileSync(scanner, disabled)

  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--test-name-pattern=full scan covers every tracked source extension",
      "scripts/verification/absolute-path.test.mjs",
    ],
    { cwd: root, encoding: "utf8" }
  )
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(
    result.status,
    1,
    `Mutation survived or crashed:\n${result.stdout}\n${result.stderr}`
  )
  assert.match(
    result.stdout + result.stderr,
    /AssertionError/,
    "A consumer-visible assertion must fail"
  )
  assert.match(result.stdout, /not ok 1 - full scan covers every tracked source extension/)
  console.log("Killed disabled HARD absolute-path classification")
} finally {
  rmSync(root, { recursive: true, force: true })
}
