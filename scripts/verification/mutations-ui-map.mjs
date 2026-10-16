import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(directory, "../gpuix-ui-map.mjs"), "utf8")
const tests = path.join(directory, "ui-map.test.mjs")
const mutations = [
  {
    name: "TD-01 index source content",
    pattern: "--stage uses the index",
    original: "const readSource = file =>\n  staged",
    replacement: "const readSource = file =>\n  false",
  },
  {
    name: "TD-01 clean map refresh",
    pattern: "--stage refreshes a clean working map",
    original: "if (workingMap === indexedMap) writeFileSync(output, content)",
    replacement: "if (false) writeFileSync(output, content)",
  },
  {
    name: "TD-06 conditional testId prefix",
    pattern: "conditional clip testId",
    original: "const ids = match[3]",
    replacement: "const ids = false",
  },
  {
    name: "TD-06 conditional literal prefix",
    pattern: "conditional selector preserves a literal prefix",
    original: `\`\${prefix}\${match[3]}\${match[5]}…\`, \`\${prefix}\${match[4]}\${match[5]}…\``,
    replacement: `\`\${match[3]}\${match[5]}…\`, \`\${match[4]}\${match[5]}…\``,
  },
]

const root = mkdtempSync(path.join(tmpdir(), "gpuix-ui-map-mutations-"))
try {
  for (const mutation of mutations) {
    assert.equal(
      source.split(mutation.original).length,
      2,
      `${mutation.name}: expected exactly one fix seam`
    )
    const file = path.join(root, "gpuix-ui-map.mjs")
    const run = () =>
      spawnSync(
        process.execPath,
        ["--test", "--test-reporter=tap", `--test-name-pattern=${mutation.pattern}`, tests],
        {
          cwd: path.resolve(directory, "../.."),
          env: { ...process.env, GPUIX_UI_MAP_SCRIPT: file },
          encoding: "utf8",
        }
      )
    writeFileSync(file, source)
    const baseline = run()
    assert.equal(
      baseline.status,
      0,
      `${mutation.name}: fixed behavior failed\n${baseline.stdout}\n${baseline.stderr}`
    )
    writeFileSync(
      file,
      source.replace(mutation.original, () => mutation.replacement)
    )
    const result = run()
    assert.equal(
      result.status,
      1,
      `${mutation.name}: mutant escaped\n${result.stdout}\n${result.stderr}`
    )
    assert.match(
      result.stdout,
      /not ok \d+ - /,
      `${mutation.name}: expected behavioral assertion failure`
    )
    assert.match(
      result.stdout,
      /AssertionError/,
      `${mutation.name}: test must fail at an assertion`
    )
    process.stdout.write(`${mutation.name}: killed\n`)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}
