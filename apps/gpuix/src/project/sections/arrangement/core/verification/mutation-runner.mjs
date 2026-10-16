import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

export function runMutations({ root, preload, suites, mutations, notes = [] }) {
  const filesBySuite = new Map(
    Object.entries(suites).map(([name, suite]) => [
      name,
      { files: suite.files.map(file => path.resolve(root, file)), pattern: suite.pattern },
    ])
  )
  const allFiles = [...new Set([...filesBySuite.values()].flatMap(suite => suite.files))]
  const sourceFiles = [...new Set(mutations.map(mutation => path.resolve(root, mutation.file)))]
  const fingerprint = file => createHash("sha256").update(readFileSync(file)).digest("hex")
  const fingerprints = new Map(sourceFiles.map(file => [file, fingerprint(file)]))
  function run(mutation) {
    const suite = mutation ? filesBySuite.get(mutation.suite) : { files: allFiles }
    if (!suite) throw new Error(`Unknown mutation suite: ${mutation.suite}`)
    const args = ["test", "--preload", preload]
    if (suite.pattern) args.push("--test-name-pattern", suite.pattern)
    args.push(...suite.files)
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        CORE_MUTATION: mutation?.name ?? "",
        CORE_MUTATION_FILE: mutation?.file ?? "",
        CORE_MUTATION_FROM: mutation?.from ?? "",
        CORE_MUTATION_TO: mutation?.to ?? "",
      },
    })
    return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` }
  }
  let problems = 0
  let executionError
  let changedSources
  try {
    for (const note of notes) process.stdout.write(`NOTE: ${note}\n`)
    const baseline = run()
    if (
      baseline.error ||
      baseline.signal ||
      baseline.status !== 0 ||
      Number(baseline.output.match(/(\d+) pass\b/u)?.[1] ?? 0) === 0
    )
      throw new Error(
        `Baseline failed; no mutation results are valid.\n${baseline.error ?? baseline.signal ?? ""}\n${baseline.output}`
      )
    process.stdout.write(`BASELINE: passed (${allFiles.length} consumer test files)\n`)
    for (const mutation of mutations) {
      const source = readFileSync(path.resolve(root, mutation.file), "utf8")
      if (source.split(mutation.from).length !== 2) {
        problems++
        process.stdout.write(`DRIFT: ${mutation.name}: expected one anchor in ${mutation.file}\n`)
        continue
      }
      const result = run(mutation)
      const failures = Number(result.output.match(/(\d+) fail\b/u)?.[1] ?? 0)
      const applied = result.output.includes(`[core-mutation] applied ${mutation.name}`)
      const loadError =
        /SyntaxError|ParseError|ResolveMessage|BuildMessage|Cannot find (?:module|package)|ModuleNotFound|Export named .* not found|does not provide an export|Failed to (?:resolve|load|compile)|error:.*(?:Cannot resolve|Could not resolve|No matching export)|errors? outside of tests/iu.test(
          result.output
        )
      const assertion =
        /\(fail\) /u.test(result.output) &&
        /expect\(|AssertionError|Expected:|Received:/u.test(result.output)
      if (
        !result.error &&
        !result.signal &&
        result.status !== null &&
        result.status !== 0 &&
        applied &&
        failures > 0 &&
        assertion &&
        !loadError
      ) {
        process.stdout.write(
          `KILLED: ${mutation.name}: ${failures} consumer regression(s) [${mutation.suite}]\n`
        )
      } else {
        problems++
        const outcome = result.status === 0 && applied ? "SURVIVED" : "INVALID"
        process.stdout.write(
          `${outcome}: ${mutation.name} [${mutation.suite}]\n${result.error ?? result.signal ?? ""}\n${result.output}\n`
        )
      }
    }
  } catch (error) {
    executionError = error
  } finally {
    changedSources = [...fingerprints].filter(([file, before]) => fingerprint(file) !== before)
  }
  if (changedSources.length) {
    const hashError = new Error(
      `Mutation source changed on disk:\n${changedSources.map(([file]) => file).join("\n")}`
    )
    throw executionError
      ? new AggregateError(
          [executionError, hashError],
          "Mutation execution and source preservation failed"
        )
      : hashError
  }
  process.stdout.write(`SOURCE HASHES: unchanged (${fingerprints.size} files)\n`)
  if (executionError) throw executionError
  if (problems)
    throw new Error(
      `${problems}/${mutations.length} mutations survived, drifted or failed to execute`
    )
  process.stdout.write(`${mutations.length} literal-reversion mutations killed.\n`)
}
