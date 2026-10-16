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
    "scripts/gpuix-main/paths.mjs",
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
  for (const mutation of [
    {
      name: "disabled HARD absolute-path classification",
      from: '  "absolute-path",\n',
      to: "",
      pattern: "full scan covers every tracked source extension",
    },
    { name: "bare shell root boundary", from: ",;}]", to: ",;]", pattern: "bare machine roots" },
  ]) {
    assert.equal(original.split(mutation.from).length, 2, mutation.name)
    writeFileSync(
      scanner,
      original.replace(mutation.from, () => mutation.to)
    )
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        `--test-name-pattern=${mutation.pattern}`,
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
    assert.match(result.stdout + result.stderr, /AssertionError/)
    assert.match(result.stdout, /not ok 1 - /)
    console.log(`KILLED ${mutation.name}`)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}
