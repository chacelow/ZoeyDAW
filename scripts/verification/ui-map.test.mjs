import assert from "node:assert/strict"
import test from "node:test"
import { chmodSync } from "node:fs"
import path from "node:path"
import { uiMapFixture } from "./ui-map-fixture.mjs"

const checkSuccess = result =>
  assert.equal(result.status, 0, result.stderr || result.error?.message)

test("--stage uses the index, not a wholly unstaged TSX, and preserves an edited map", () => {
  const f = uiMapFixture()
  try {
    f.put(f.aPath, f.baseline("a-staged"))
    f.git("add", "--", f.aPath)
    f.put(f.bPath, f.baseline("b-unstaged"))
    const userMap = `${f.read(f.mapPath)}\nLocal map notes that must not be overwritten.\n`
    f.put(f.mapPath, userMap)
    const stagedRun = f.run("--stage")
    checkSuccess(stagedRun)
    assert.match(stagedRun.stdout, /^wrote docs\/architecture\/gpuix-ui-map\.md: /)
    const staged = f.index(f.mapPath)
    assert.match(staged, /`a-staged`/)
    assert.match(staged, /`b-original`/)
    assert.doesNotMatch(staged, /`b-unstaged`/)
    assert.equal(f.read(f.mapPath), userMap)
    assert.equal(f.read(f.bPath), f.baseline("b-unstaged"))
    assert.equal(f.index(f.bPath), f.baseline("b-original").trimEnd())
  } finally {
    f.close()
  }
})

test("a lint-staged commit excludes an entirely unstaged selector change", () => {
  const f = uiMapFixture()
  try {
    const lintStaged = path.resolve(
      import.meta.dirname,
      "../../node_modules/lint-staged/bin/lint-staged.js"
    )
    f.put(
      ".lintstagedrc.json",
      JSON.stringify({ "apps/gpuix/src/**/*.{ts,tsx}": "node scripts/gpuix-ui-map.mjs --stage" })
    )
    f.put(
      ".git/hooks/pre-commit",
      `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(lintStaged)}\n`
    )
    chmodSync(path.join(f.root, ".git/hooks/pre-commit"), 0o755)
    f.put(f.aPath, f.baseline("a-staged"))
    f.git("add", "--", f.aPath)
    f.put(f.bPath, f.baseline("b-unstaged"))
    const userMap = `${f.read(f.mapPath)}\nUnstaged user notes.\n`
    f.put(f.mapPath, userMap)
    f.git("commit", "--quiet", "-m", "fix: update one selector")
    const committed = f.git("show", `HEAD:${f.mapPath}`)
    assert.match(committed, /`a-staged`/)
    assert.match(committed, /`b-original`/)
    assert.doesNotMatch(committed, /`b-unstaged`|Unstaged user notes/)
    assert.equal(f.git("show", `HEAD:${f.bPath}`), f.baseline("b-original").trimEnd())
    assert.equal(f.read(f.bPath), f.baseline("b-unstaged"))
    assert.equal(f.read(f.mapPath), userMap)
  } finally {
    f.close()
  }
})

test("--stage refreshes a clean working map alongside the index", () => {
  const f = uiMapFixture()
  try {
    f.put(f.aPath, f.baseline("a-staged"))
    f.git("add", "--", f.aPath)
    checkSuccess(f.run("--stage"))
    const staged = f.index(f.mapPath)
    assert.match(staged, /`a-staged`/)
    assert.equal(f.read(f.mapPath).trimEnd(), staged)
    assert.equal(f.git("diff", "--", f.mapPath), "")
    checkSuccess(f.run("--check"))
  } finally {
    f.close()
  }
})

test("--stage excludes unstaged half of a partially staged file and staged deletions", () => {
  const f = uiMapFixture()
  try {
    f.put(f.aPath, f.baseline("a-index"))
    f.git("add", "--", f.aPath)
    f.put(f.aPath, f.baseline("a-working"))
    f.git("rm", "--quiet", "--", f.bPath)
    checkSuccess(f.run("--stage"))
    const staged = f.index(f.mapPath)
    assert.match(staged, /`a-index`/)
    assert.doesNotMatch(staged, /`a-working`|`b-original`/)
    assert.equal(f.read(f.aPath), f.baseline("a-working"))
  } finally {
    f.close()
  }
})

test("default generation and --check still use working tree, not the index", () => {
  const f = uiMapFixture()
  try {
    f.put(f.aPath, f.baseline("a-working"))
    const stale = f.run("--check")
    assert.equal(stale.status, 1)
    assert.match(stale.stderr, /gpuix-ui-map\.md is stale/)
    const written = f.run()
    checkSuccess(written)
    assert.match(written.stdout, /^wrote docs\/architecture\/gpuix-ui-map\.md: /)
    assert.match(f.read(f.mapPath), /`a-working`/)
    assert.equal(f.index(f.mapPath).includes("`a-working`"), false)
    const current = f.run("--check")
    checkSuccess(current)
    assert.match(current.stdout, /^ui map current: /)
  } finally {
    f.close()
  }
})

test("conditional clip testId emits both stable runtime selectors", () => {
  const f = uiMapFixture()
  try {
    f.put(f.aPath, f.clip)
    checkSuccess(f.run())
    const map = f.read(f.mapPath)
    assert.match(map, /`clip-ghost-…`/)
    assert.match(map, /`clip-source-…`/)
    checkSuccess(f.run("--check"))
  } finally {
    f.close()
  }
})

test("conditional selector preserves a literal prefix before both branches", () => {
  const f = uiMapFixture()
  try {
    f.put(
      f.aPath,
      'export function Card({ flag, id }) { return <div testId={`lane-${flag ? "ghost" : "source"}-${id}`} /> }\n'
    )
    checkSuccess(f.run())
    const map = f.read(f.mapPath)
    assert.match(map, /`lane-ghost-…`/)
    assert.match(map, /`lane-source-…`/)
    checkSuccess(f.run("--check"))
  } finally {
    f.close()
  }
})
