import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const project = path.resolve(import.meta.dirname, "../..")
const mutations = [
  {
    name: "shared vendor alias",
    file: "scripts/gpuix-main/paths.mjs",
    from: 'canonicalBuildPath(path.join(base, "zoeydaw-gpuix"))',
    to: 'path.join(base, "zoeydaw-gpuix")',
    pattern: "shared vendor symlink",
  },
  {
    name: "shared target alias",
    file: "scripts/gpuix-main/paths.mjs",
    from: 'canonicalBuildPath(path.join(base, "target"))',
    to: 'path.join(base, "target")',
    pattern: "shared target symlink",
  },
  {
    name: "mode ancestor overlap",
    file: "scripts/gpuix-main/redraw-mode-mutations.mjs",
    from: " || isWithinBuildPath(root, value)",
    to: "",
    pattern: "redraw-mode-mutations.*ancestor",
  },
  {
    name: "native ancestor overlap",
    file: "scripts/gpuix-main/redraw-regression/mutate.mjs",
    from: " || inside(root, path)",
    to: "",
    pattern: "redraw-regression.*ancestor",
  },
]
const workspace = mkdtempSync(path.join(tmpdir(), "gpuix-isolation-mutations-"))
const root = path.join(workspace, "repo")
try {
  mkdirSync(root)
  execFileSync("/usr/bin/git", ["init", "--quiet"], { cwd: root })
  for (const file of [
    "scripts/gpuix-main/paths.mjs",
    "scripts/gpuix-main/build.sh",
    "scripts/gpuix-main/check.mjs",
    "scripts/gpuix-main/config.json",
    "scripts/gpuix-main/build-contract-fixture.mjs",
    "scripts/gpuix-main/redraw-mode-mutations.mjs",
    "scripts/gpuix-main/redraw-regression/mutate.mjs",
    "scripts/verification/mutation-isolation.test.mjs",
  ]) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(project, file), target)
  }
  const run = pattern =>
    spawnSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        `--test-name-pattern=${pattern}`,
        "scripts/verification/mutation-isolation.test.mjs",
      ],
      { cwd: root, encoding: "utf8" }
    )
  for (const mutation of mutations) {
    const baseline = run(mutation.pattern)
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
    const target = path.join(root, mutation.file)
    const original = readFileSync(target, "utf8")
    assert.equal(original.split(mutation.from).length, 2, mutation.name)
    writeFileSync(
      target,
      original.replace(mutation.from, () => mutation.to)
    )
    const result = run(mutation.pattern)
    assert.equal(result.status, 1, `${mutation.name} survived\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /AssertionError/)
    assert.match(result.stdout, /not ok \d+ - /)
    writeFileSync(target, original)
    console.log(`KILLED ${mutation.name}`)
  }
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
