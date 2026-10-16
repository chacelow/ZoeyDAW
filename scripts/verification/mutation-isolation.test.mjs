import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { buildFixture } from "../gpuix-main/build-contract-fixture.mjs"

const repo = path.resolve(import.meta.dirname, "../..")
const common = execFileSync(
  "/usr/bin/git",
  ["rev-parse", "--path-format=absolute", "--git-common-dir"],
  {
    cwd: repo,
    encoding: "utf8",
  }
).trim()
const base = path.resolve(path.dirname(common), "../_vendor")
const sharedVendor = path.join(base, "zoeydaw-gpuix")
const sharedTarget = path.join(base, "target")
const scripts = [
  "scripts/gpuix-main/redraw-mode-mutations.mjs",
  "scripts/gpuix-main/redraw-regression/mutate.mjs",
]

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "gpuix-mutation-isolation-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { vendor: path.join(root, "isolated-vendor"), target: path.join(root, "target") }
}

function run(script, { vendor, target, ci, args = [] } = {}) {
  const env = { ...process.env }
  delete env.GPUIX_VENDOR_ROOT
  delete env.CARGO_TARGET_DIR
  delete env.CI
  if (vendor !== undefined) env.GPUIX_VENDOR_ROOT = vendor
  if (target !== undefined) env.CARGO_TARGET_DIR = target
  if (ci !== undefined) env.CI = ci
  return spawnSync(process.execPath, [path.join(repo, script), ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
    timeout: 5000,
  })
}

function refused(result, message) {
  assert.equal(result.status, 1, result.error?.message || result.stderr)
  assert.match(result.stderr, message)
  assert.doesNotMatch(result.stdout, /Mutation evidence:|KILLED /)
}

for (const script of scripts) {
  test(`${script}: --help does not require vendor or invoke a build`, () => {
    const result = run(script, { args: ["--help"] })
    assert.equal(result.status, 0, result.error?.message || result.stderr)
    assert.match(result.stdout, /GPUIX_VENDOR_ROOT/)
    for (const root of ["Volumes", "Users", "tmp", "private", "var/folders"])
      assert.equal(result.stdout.includes(["", root, ""].join("/")), false)
  })

  test(`${script}: missing vendor is rejected before accessing checkout`, t => {
    const { target } = fixture(t)
    refused(run(script, { target }), /GPUIX_VENDOR_ROOT/)
  })

  test(`${script}: shared Cargo target is rejected before accessing checkout`, t => {
    const { vendor } = fixture(t)
    refused(
      run(script, { vendor, target: sharedTarget, ci: "true" }),
      /shared\/repository cargo target|shared.*target/i
    )
  })
}

test("native mutation: missing target is rejected before accessing checkout", t => {
  const { vendor } = fixture(t)
  refused(run(scripts[1], { vendor }), /CARGO_TARGET_DIR/)
})

test("mode mutation: shared vendor is rejected before accessing checkout", t => {
  const { target } = fixture(t)
  refused(
    run(scripts[0], { vendor: sharedVendor, target }),
    /shared\/repository vendor root|shared.*vendor/i
  )
})

test("mode mutation: repository is not a vendor root", t => {
  const { target } = fixture(t)
  refused(
    run(scripts[0], { vendor: repo, target }),
    /shared\/repository vendor root|repository.*vendor/i
  )
})

test("mode mutation: local target outside shared build base is rejected", t => {
  const { vendor, target } = fixture(t)
  refused(run(scripts[0], { vendor, target }), /CARGO_TARGET_DIR.*base|cargo target.*base/i)
})

test("native mutation: shared vendor is rejected before accessing checkout", t => {
  const { target } = fixture(t)
  refused(
    run(scripts[1], { vendor: sharedVendor, target }),
    /shared\/repository vendor root|shared.*vendor/i
  )
})

test("native mutation: repository is not a vendor root", t => {
  const { target } = fixture(t)
  refused(
    run(scripts[1], { vendor: repo, target }),
    /shared\/repository vendor root|repository.*vendor/i
  )
})

test("native mutation: local target outside shared build base is rejected", t => {
  const { vendor, target } = fixture(t)
  refused(run(scripts[1], { vendor, target }), /CARGO_TARGET_DIR.*base|cargo target.*base/i)
})

for (const script of scripts) {
  test(`${script}: ancestor of shared vendor cannot be an isolated root`, t => {
    const { target } = fixture(t)
    refused(run(script, { vendor: base, target, ci: "true" }), /shared\/repository vendor root/i)
  })
  test(`${script}: ancestor of shared target cannot be an isolated target`, t => {
    const { vendor } = fixture(t)
    refused(run(script, { vendor, target: base, ci: "true" }), /shared\/repository cargo target/i)
  })
}

for (const script of scripts) {
  test(`${script}: shared vendor symlink is rejected through its real path`, t => {
    const f = buildFixture()
    t.after(f.close)
    const actual = path.join(f.root, "../shared-vendor-real")
    renameSync(f.vendorRoot, actual)
    symlinkSync(actual, f.vendorRoot)
    const entry = path.join(f.root, script)
    mkdirSync(path.dirname(entry), { recursive: true })
    copyFileSync(path.join(repo, script), entry)
    const result = spawnSync(process.execPath, [entry], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "true",
        GPUIX_VENDOR_ROOT: actual,
        CARGO_TARGET_DIR: path.join(f.root, "../isolated-target"),
      },
    })
    refused(result, /shared\/repository vendor root/i)
  })
  test(`${script}: shared target symlink is rejected through its real path`, t => {
    const f = buildFixture()
    t.after(f.close)
    const actual = path.join(f.root, "../shared-target-real")
    mkdirSync(actual)
    symlinkSync(actual, path.join(f.vendorRoot, "../target"))
    const entry = path.join(f.root, script)
    mkdirSync(path.dirname(entry), { recursive: true })
    copyFileSync(path.join(repo, script), entry)
    const result = spawnSync(process.execPath, [entry], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "true",
        GPUIX_VENDOR_ROOT: path.join(f.root, "../isolated-vendor"),
        CARGO_TARGET_DIR: actual,
      },
    })
    refused(result, /shared\/repository cargo target/i)
  })
}
