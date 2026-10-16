import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const moduleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const mutations = [
  {
    name: "raw sink arguments",
    file: "logger.ts",
    from: "emitToSinks(level, sinkArguments)",
    to: "emitToSinks(level, arguments_)",
  },
  {
    name: "recursive Error cause normalization",
    file: "serialize.ts",
    from: "out.cause = error.cause",
    to: "out.cause = error.cause instanceof Error ? normalizeError(error.cause) : error.cause",
  },
]
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
for (const mutation of mutations) {
  const file = path.join(moduleDirectory, mutation.file)
  const original = readFileSync(file, "utf8")
  if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      original.replaceAll(mutation.from, () => mutation.to)
    )
    result = run()
  } finally {
    writeFileSync(file, original)
  }
  const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
  if (result.status === 0 || !failed || !result.output.includes("(fail)")) {
    throw new Error(`UPA-08 ${mutation.name} mutation survived:\n${result.output}`)
  }
  console.log(`UPA-08 ${mutation.name}: ${failed} failing tests`)
}
console.log(`${mutations.length} mutations caught; originals restored`)
