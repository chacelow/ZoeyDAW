import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitExecutable } from "./paths.mjs"
import test from "node:test"

const source = path.dirname(fileURLToPath(import.meta.url))
const git = (cwd, ...args) =>
  execFileSync(gitExecutable(), ["-C", cwd, ...args], { encoding: "utf8" }).trimEnd()

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "gpuix-patch-check-"))
  const script = path.join(root, "scripts/gpuix-main")
  const vendor = path.join(root, "vendor")
  const zed = path.join(vendor, "zed")
  mkdirSync(path.join(script, "patches"), { recursive: true })
  mkdirSync(zed, { recursive: true })
  for (const name of ["check.mjs", "paths.mjs"])
    copyFileSync(path.join(source, name), path.join(script, name))
  for (const repo of [zed, vendor]) {
    git(repo, "init", "--quiet")
    git(repo, "config", "user.name", "Patch identity test")
    git(repo, "config", "user.email", "patch-test@localhost")
    writeFileSync(path.join(repo, "source.txt"), "baseline\n")
    git(repo, "add", "source.txt")
    if (repo === vendor) git(repo, "add", "zed")
    git(repo, "commit", "--quiet", "-m", "fixture")
  }
  symlinkSync(vendor, path.join(root, ".gpuix-main"))
  const config = {
    revision: git(vendor, "rev-parse", "HEAD"),
    zedRevision: git(zed, "rev-parse", "HEAD"),
    patches: ["native.patch"],
    zedPatches: ["zed.patch"],
  }
  writeFileSync(path.join(script, "config.json"), JSON.stringify(config))
  for (const [repo, name] of [
    [vendor, "native.patch"],
    [zed, "zed.patch"],
  ]) {
    writeFileSync(path.join(repo, "source.txt"), "patched\n")
    writeFileSync(
      path.join(script, "patches", name),
      `${git(repo, "diff", "--ignore-submodules=dirty", "--", "source.txt")}\n`
    )
    writeFileSync(path.join(repo, "source.txt"), "baseline\n")
  }
  return {
    vendor,
    zed,
    close: () => rmSync(root, { recursive: true, force: true }),
    check: mode =>
      spawnSync(process.execPath, [path.join(script, "check.mjs"), mode, vendor], {
        encoding: "utf8",
      }),
    apply: (repo, name) => git(repo, "apply", path.join(script, "patches", name)),
  }
}

test("native and zed patches each require an exact registered prefix", () => {
  const f = fixture()
  try {
    let result = f.check("--pending")
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, "native.patch\nzed/zed.patch\n")
    assert.notEqual(f.check("--sources").status, 0)
    f.apply(f.vendor, "native.patch")
    result = f.check("--pending")
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, "zed/zed.patch\n")
    assert.notEqual(f.check("--sources").status, 0)
    f.apply(f.zed, "zed.patch")
    assert.equal(f.check("--pending").stdout, "")
    result = f.check("--sources")
    assert.equal(result.status, 0, result.stderr)
    for (const repo of [f.vendor, f.zed]) {
      writeFileSync(path.join(repo, "source.txt"), "unregistered edit\n")
      for (const mode of ["--pending", "--sources", "--record"]) {
        result = f.check(mode)
        assert.notEqual(result.status, 0)
        assert.match(result.stderr, /must contain exactly the checked-in ordered patch series/)
      }
      writeFileSync(path.join(repo, "source.txt"), "patched\n")
      writeFileSync(path.join(repo, "untracked.txt"), "unexpected\n")
      result = f.check("--pending")
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /Refusing untracked/)
      rmSync(path.join(repo, "untracked.txt"))
    }
    git(f.zed, "add", "source.txt")
    git(f.zed, "commit", "--quiet", "-m", "unexpected revision")
    result = f.check("--sources")
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Expected zed/)
  } finally {
    f.close()
  }
})
