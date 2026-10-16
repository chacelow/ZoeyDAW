import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
} from "node:fs"
import path from "node:path"
import { canonicalBuildPath, gitExecutable, isWithinBuildPath, sharedBuildPaths } from "./paths.mjs"
import {
  findDependencyJunctionRepairs,
  repairDependencyJunctions,
} from "./windows-dependency-links.mjs"

const directory = import.meta.dirname
const root = path.resolve(directory, "../..")
const mode = process.argv[2] ?? "runtime"
if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/gpuix-main/build-windows.mjs [runtime|precompiled]")
  process.exit(0)
}
if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("The Windows renderer build requires a Windows x64 host")
}
if (!["runtime", "precompiled"].includes(mode)) throw new Error("Unknown renderer build mode")
const config = JSON.parse(readFileSync(path.join(directory, "config.json"), "utf8"))
const paths = sharedBuildPaths(root)
const vendorRoot = canonicalBuildPath(process.env.GPUIX_VENDOR_ROOT ?? paths.vendorRoot)
const vendor = path.join(vendorRoot, config.revision)
const target = canonicalBuildPath(process.env.CARGO_TARGET_DIR ?? paths.target)
const jobs = process.env.CARGO_BUILD_JOBS ?? "3"
if (!/^[1-6]$/.test(jobs)) throw new Error("CARGO_BUILD_JOBS must be between 1 and 6")
if (process.env.CI !== "true" && !isWithinBuildPath(target, paths.base)) {
  throw new Error(`CARGO_TARGET_DIR must stay under the derived vendor base: ${paths.base}`)
}
const env = { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: jobs }
const check = path.join(directory, "check.mjs")

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.signal})`)
  }
}

function git(repository, ...args) {
  return execFileSync(gitExecutable(), ["-C", repository, ...args], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd()
}

function linkDirectory(destination, link) {
  // Junctions do not need Developer Mode or the symlink privilege on a hosted runner.
  let existing
  try {
    existing = lstatSync(link)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (existing) {
    if (!existing.isSymbolicLink()) {
      throw new Error(`Refusing to replace a non-link directory: ${link}`)
    }
    rmSync(link)
  }
  symlinkSync(destination, link, "junction")
}

function linkCheckout() {
  linkDirectory(vendor, path.join(root, ".gpuix-main"))
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fixture = path.join(directory, entry.name)
    if (!entry.isDirectory() || !existsSync(path.join(fixture, "tsconfig.json"))) continue
    linkDirectory(path.join(root, "apps/gpuix/node_modules"), path.join(fixture, "node_modules"))
  }
}

function acquireBuildLock() {
  mkdirSync(vendorRoot, { recursive: true })
  const lock = path.join(vendorRoot, ".build-lock")
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(`Another gpuix build owns ${lock}; do not remove it`)
    throw error
  }
  return lock
}

const cached = spawnSync(process.execPath, [check, "--vendor", vendor, "--build-mode", mode], {
  cwd: root,
  env,
  stdio: "inherit",
})
if (cached.error) throw cached.error
if (cached.status === 0) {
  const needsRepair = findDependencyJunctionRepairs(vendor).length > 0
  if (needsRepair) {
    const lock = acquireBuildLock()
    try {
      console.log(
        `Repaired ${repairDependencyJunctions(vendor)} dependency links as absolute junctions`
      )
    } finally {
      rmdirSync(lock)
    }
  }
  linkCheckout()
  console.log(
    needsRepair
      ? "Linked verified gpuix build after dependency link repair without rebuilding"
      : "Linked verified gpuix build without rebuilding or acquiring the build lock"
  )
  process.exit(0)
}

const lock = acquireBuildLock()
try {
  if (!existsSync(path.join(vendor, ".git"))) {
    run(gitExecutable(), [
      "clone",
      "--filter=blob:none",
      "https://github.com/remorses/gpuix.git",
      vendor,
    ])
    git(vendor, "checkout", "--detach", config.revision)
  }
  if (git(vendor, "rev-parse", "HEAD") !== config.revision) {
    throw new Error("Refusing to build a different gpuix revision")
  }
  git(vendor, "submodule", "update", "--init", "--depth", "1")
  const zed = path.join(vendor, "zed")
  if (git(zed, "rev-parse", "HEAD") !== config.zedRevision)
    throw new Error("Unexpected Zed revision")
  const pending = execFileSync(process.execPath, [check, "--pending", vendor], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  for (const name of pending.trim().split(/\r?\n/).filter(Boolean)) {
    const isZed = name.startsWith("zed/")
    git(
      isZed ? zed : vendor,
      "apply",
      path.join(directory, "patches", isZed ? name.slice(4) : name)
    )
  }
  for (const repository of [vendor, zed]) {
    const created = git(repository, "ls-files", "--others", "--exclude-standard", "-z")
    for (const filename of created.split("\0").filter(Boolean)) {
      git(repository, "add", "--intent-to-add", "--", filename)
    }
  }
  run(process.execPath, [check, "--sources", vendor])
  mkdirSync(target, { recursive: true })
  run("bun", ["install", "--frozen-lockfile"], vendor)
  console.log(
    `Repaired ${repairDependencyJunctions(vendor)} dependency links as absolute junctions`
  )
  const native = path.join(vendor, "packages/native")
  run("rustc", ["-vV"], native)
  // DirectX compiles HLSL on Windows; the macOS Metal runtime/precompiled distinction
  // remains part of the manifest, but neither Windows mode invokes xcrun or BSD time/stat.
  run(
    "bun",
    [
      "x",
      "napi",
      "build",
      "--platform",
      "--esm",
      "--js",
      "index.js",
      "--release",
      "--features",
      "test-support",
    ],
    native
  )
  run("bun", ["run", "build:js"], native)
  console.log(`${statSync(path.join(native, "gpuix-native.win32-x64-msvc.node")).size} bytes`)
  run("bun", ["run", "build"], path.join(vendor, "packages/react"))
  linkCheckout()
  run(process.execPath, [check, "--record", "--build-mode", mode])
} finally {
  // Only this invocation created the lock; a failed build never removes somebody else's lock.
  rmdirSync(lock)
}
