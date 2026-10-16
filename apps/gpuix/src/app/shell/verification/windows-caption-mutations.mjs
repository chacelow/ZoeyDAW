/* eslint-disable no-await-in-loop -- Two isolated native scenarios run serially to avoid overlapping windows. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { spawn } from "bun"

const [directory, driverArgument] = process.argv.slice(2)
if (process.platform !== "win32" || !directory || !driverArgument)
  throw new Error("Usage: bun windows-caption-mutations.mjs <evidence-directory> <compiled-driver>")
const output = path.resolve(directory)
const driver = path.resolve(driverArgument)
const probe = path.join(import.meta.dirname, "windows-caption.mjs")
for (const duplicateAction of [true, false]) {
  const evidence = duplicateAction ? path.join(output, "duplicate-action") : output
  const child = spawn(
    [process.execPath, probe, evidence, driver, ...(duplicateAction ? ["--duplicate-action"] : [])],
    { stdout: "pipe", stderr: "pipe" }
  )
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  const observed = JSON.parse(readFileSync(path.join(evidence, "native-caption.json"), "utf8"))
  if (duplicateAction) {
    assert.notEqual(status, 0, "The duplicate Windows callback mutation incorrectly passed")
    assert.equal(observed.duplicateActionMutation, true)
    assert.deepEqual(observed.after.nativeClickCounts, [1, 2])
    assert.ok(observed.after.systemActions > 0, "The mutated JS callback was never exercised")
    console.log(`caught duplicate Windows system action: ${observed.after.systemActions}`)
  } else {
    assert.equal(status, 0, `${stdout}\n${stderr}`)
    assert.deepEqual(observed.after.nativeClickCounts, [1, 2, 1, 2])
    assert.equal(observed.after.systemActions, 0)
    console.log(stdout.trim())
  }
}
console.log(
  "T2_NATIVE_MUTATION_CAUGHT: duplicate callback rejected; unmodified production path passed"
)
