import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const source = import.meta.dirname
const directory = mkdtempSync(path.join(tmpdir(), "gpuix-build-mutations-"))
try {
  for (const name of [
    "check.mjs",
    "build.sh",
    "paths.mjs",
    "build-contract-fixture.mjs",
    "build-contract.test.mjs",
  ])
    copyFileSync(path.join(source, name), path.join(directory, name))
  const run = pattern =>
    spawnSync(
      process.execPath,
      ["--test", "--test-name-pattern", pattern, path.join(directory, "build-contract.test.mjs")],
      { encoding: "utf8" }
    )
  const baseline = run("identity gate|verified build")
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
  for (const mutation of [
    {
      name: "TD-02 omitted internal native outputs",
      file: "check.mjs",
      from: '...compiledOutputs("packages/native/dist"),',
      to: "",
      pattern: "identity gate rejects .*packages/native/dist/renderer-state",
      failure: "passed the identity gate",
    },
    {
      name: "TD-03 rebuild before linking",
      file: "build.sh",
      from: 'if node "$script_dir/check.mjs" --vendor',
      to: 'if false && node "$script_dir/check.mjs" --vendor',
      pattern: "verified build links",
      failure: "Another gpuix build owns",
    },
  ]) {
    const file = path.join(directory, mutation.file)
    const original = readFileSync(file, "utf8")
    assert.equal(original.split(mutation.from).length, 2, mutation.name)
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    const result = run(mutation.pattern)
    assert.notEqual(result.status, 0, `${mutation.name} survived`)
    assert.ok(
      (result.stdout + result.stderr).includes(mutation.failure),
      result.stdout + result.stderr
    )
    process.stdout.write(`KILLED ${mutation.name}\n`)
    writeFileSync(file, original)
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
