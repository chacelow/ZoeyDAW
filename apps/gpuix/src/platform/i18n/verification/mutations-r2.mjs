import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const file = path.join(app, "src/platform/i18n/core.ts")
const mutations = [
  {
    name: "UPA-03 locale read failure escapes startup",
    from: `  let language: string | null | undefined
  try {
    language =
      storage?.get() ?? options?.initialLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale
  } catch (error) {
    language = options?.initialLanguage ?? DEFAULT_LOCALE
    logger.warn(
      "[i18n] Could not read locale; using fallback",
      { operation: "read", locale: resolveLocale(language) },
      error
    )
  }`,
    to: `  const language =
    storage?.get() ?? options?.initialLanguage ?? Intl.DateTimeFormat().resolvedOptions().locale`,
    pattern: "storage read failure",
  },
  {
    name: "UPA-03 locale write failure rejects selection",
    from: `  try {
    storage?.set(locale)
  } catch (error) {
    logger.warn(
      "[i18n] Could not persist locale; keeping selected language",
      { operation: "write", locale },
      error
    )
  }`,
    to: "  storage?.set(locale)",
    pattern: "storage write failure",
  },
]

function run(pattern) {
  const args = ["test", "src/platform/i18n/core.test.ts"]
  if (pattern) args.push("--test-name-pattern", pattern)
  const result = spawnSync(process.execPath, args, { cwd: app, encoding: "utf8" })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const baseline = run()
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
for (const mutation of mutations) {
  const original = readFileSync(file, "utf8")
  if (original.split(mutation.from).length !== 2) {
    throw new Error(`Stale or ambiguous mutation: ${mutation.name}`)
  }
  let result
  try {
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation.pattern)
  } finally {
    writeFileSync(file, original)
  }
  const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
  if (result.status === 0 || !failed || !result.output.includes("(fail)")) {
    throw new Error(
      `Mutation was not caught by a behavior assertion: ${mutation.name}\n${result.output}`
    )
  }
  console.log(`${mutation.name}: ${failed} failing test(s)`)
}
console.log(`${mutations.length} mutations caught; originals restored`)
