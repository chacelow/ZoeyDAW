import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const moduleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const file = path.join(moduleDirectory, "logger.ts")
const original = readFileSync(file, "utf8")
const from = "emitToSinks(level, sinkArguments)"
if (original.split(from).length !== 3) throw new Error("Stale UPA-08 mutation anchors")
function run() {
  const result = spawnSync(
    process.execPath,
    ["test", path.join(moduleDirectory, "logger.test.ts"), "--test-name-pattern", "UPA-08"],
    { encoding: "utf8" }
  )
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
let result
try {
  writeFileSync(file, original.replaceAll(from, "emitToSinks(level, arguments_)"))
  result = run()
} finally {
  writeFileSync(file, original)
}
const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
if (result.status === 0 || !failed || !result.output.includes("(fail)")) {
  throw new Error(`UPA-08 raw sink arguments mutation survived:\n${result.output}`)
}
console.log(`UPA-08 raw sink arguments restored: ${failed} failing tests`)
console.log("1 mutation caught; original restored")
