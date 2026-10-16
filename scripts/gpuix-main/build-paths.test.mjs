import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildFixture } from "./build-contract-fixture.mjs"

for (const overrideVendor of [false, true]) {
  test(`build links a verified vendor on the repository disk, vendor override ${overrideVendor}`, () => {
    const fixture = buildFixture()
    try {
      assert.equal(fixture.check("--record").status, 0)
      rmSync(path.join(fixture.root, ".gpuix-main"))
      const env = {
        ...process.env,
        CI: "",
        CARGO_TARGET_DIR: path.join(fixture.vendorRoot, "../target"),
      }
      delete env.GPUIX_VENDOR_ROOT
      if (overrideVendor) env.GPUIX_VENDOR_ROOT = fixture.vendorRoot
      const result = spawnSync("/bin/bash", [path.join(fixture.scripts, "build.sh")], {
        encoding: "utf8",
        env,
      })
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.equal(
        realpathSync(path.join(fixture.root, ".gpuix-main")),
        realpathSync(fixture.vendor)
      )
      assert.match(result.stdout, /without rebuilding or acquiring the build lock/)
    } finally {
      fixture.close()
    }
  })
}

test("a Cargo target outside the derived vendor base is rejected before linking", () => {
  const fixture = buildFixture()
  try {
    assert.equal(fixture.check("--record").status, 0)
    rmSync(path.join(fixture.root, ".gpuix-main"))
    const result = spawnSync("/bin/bash", [path.join(fixture.scripts, "build.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "",
        GPUIX_VENDOR_ROOT: fixture.vendorRoot,
        CARGO_TARGET_DIR: path.join(fixture.root, "target"),
      },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /CARGO_TARGET_DIR must stay under the derived vendor base/)
    assert.throws(() => realpathSync(path.join(fixture.root, ".gpuix-main")), { code: "ENOENT" })
  } finally {
    fixture.close()
  }
})

test("linked worktrees derive the same vendor base as their primary repository", () => {
  const fixture = buildFixture()
  try {
    const git = (...args) =>
      execFileSync("/usr/bin/git", ["-C", fixture.root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim()
    git(
      "-c",
      "user.name=Path fixture",
      "-c",
      "user.email=paths@localhost",
      "commit",
      "--allow-empty",
      "-qm",
      "fixture"
    )
    const linked = path.join(fixture.root, "../linked")
    git("worktree", "add", "--detach", linked)
    const source = path.join(import.meta.dirname, "paths.mjs")
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { sharedBuildPaths } from ${JSON.stringify(pathToFileURL(source).href)}; console.log(JSON.stringify(sharedBuildPaths(process.argv[1])))`,
        linked,
      ],
      { encoding: "utf8" }
    )
    assert.equal(result.status, 0, result.stderr)
    const paths = JSON.parse(result.stdout)
    assert.equal(paths.vendorRoot, realpathSync(fixture.vendorRoot))
    assert.equal(paths.target, path.join(realpathSync(fixture.vendorRoot), "../target"))
  } finally {
    fixture.close()
  }
})

test("a target symlink cannot escape the derived vendor base", () => {
  const fixture = buildFixture()
  try {
    assert.equal(fixture.check("--record").status, 0)
    const outside = path.join(fixture.root, "target")
    mkdirSync(outside)
    const linked = path.join(fixture.vendorRoot, "../linked-target")
    symlinkSync(outside, linked)
    const result = spawnSync("/bin/bash", [path.join(fixture.scripts, "build.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "",
        GPUIX_VENDOR_ROOT: fixture.vendorRoot,
        CARGO_TARGET_DIR: linked,
      },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /CARGO_TARGET_DIR must stay under the derived vendor base/)
  } finally {
    fixture.close()
  }
})

test("missing repository identity stops initialization before linking a cached vendor", () => {
  const fixture = buildFixture()
  try {
    assert.equal(fixture.check("--record").status, 0)
    rmSync(path.join(fixture.root, ".git"), { recursive: true })
    rmSync(path.join(fixture.root, ".gpuix-main"))
    const result = fixture.build()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /not a git repository/)
    assert.throws(() => realpathSync(path.join(fixture.root, ".gpuix-main")), { code: "ENOENT" })
  } finally {
    fixture.close()
  }
})
