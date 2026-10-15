import { createHash } from "node:crypto"
import path from "node:path"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { mutationCases } from "./mutation-preload.ts"

const cwd = path.resolve(import.meta.dir, "../../../../../..")
const lane = path.resolve(import.meta.dir, "..")
const preload = path.resolve(import.meta.dir, "mutation-preload.ts")
const fingerprints = new Map()
for (const file of new Set(
  Object.values(mutationCases).map(mutation => path.resolve(lane, mutation.file))
)) {
  fingerprints.set(file, createHash("sha256").update(readFileSync(file)).digest("hex"))
}

function run(id, target) {
  const result = spawnSync(process.execPath, ["test", "--preload", preload, target], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", LANE_MUTATION: id },
    encoding: "utf8",
    timeout: 120000,
  })
  if (result.error) throw result.error
  const output = result.stdout.toString() + result.stderr.toString()
  return {
    exitCode: result.status,
    output,
    passed: Number(output.match(/\b(\d+) pass\b/)?.[1] ?? 0),
    failed: Number(output.match(/\b(\d+) fail\b/)?.[1] ?? 0),
  }
}

const baseline = run("", lane)
if (baseline.exitCode !== 0 || baseline.passed === 0 || baseline.failed !== 0) {
  process.stderr.write(baseline.output)
  throw new Error("Lane baseline must pass before mutation checking")
}

const results = []
for (const [id, mutation] of Object.entries(mutationCases)) {
  const result = run(id, path.resolve(lane, mutation.testFile))
  if (
    result.exitCode === 0 ||
    result.failed === 0 ||
    !result.output.includes(`[lane-mutation] applied ${id}`) ||
    !result.output.includes(`(fail) ${mutation.testName}`)
  ) {
    process.stderr.write(result.output)
    throw new Error(`Mutation did not fail its intended behavior: ${id}`)
  }
  results.push({ mutation: id, failedTests: result.failed, test: mutation.testName })
}
let mutationTargetsUnchanged = true
for (const [file, before] of fingerprints) {
  const after = createHash("sha256").update(readFileSync(file)).digest("hex")
  if (before !== after) mutationTargetsUnchanged = false
}
if (!mutationTargetsUnchanged) throw new Error("Mutation target changed on disk")
process.stdout.write(
  `${JSON.stringify({ baseline: { passed: baseline.passed, failed: baseline.failed }, mutations: results, mutationTargetsUnchanged }, null, 2)}\n`
)
