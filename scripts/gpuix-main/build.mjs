import { existsSync, mkdirSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { repairDependencyJunctions } from "./windows-dependency-links.mjs"

const root = path.resolve(import.meta.dirname, "../..")
const renderer = path.join(root, "vendor/gpuix")
const mode = process.argv[2] ?? "runtime"
if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/gpuix-main/build.mjs [runtime|precompiled]")
  process.exit(0)
}
if (!new Set(["runtime", "precompiled"]).has(mode))
  throw new Error(`Unknown renderer build mode: ${mode}`)
if (process.platform === "win32" && process.arch !== "x64") {
  throw new Error("The Windows renderer build requires a Windows x64 host")
}
if (!existsSync(path.join(renderer, ".git"))) {
  throw new Error(
    "Renderer submodule is not initialized. Run: git submodule update --init --recursive, then node scripts/gpuix-main/build.mjs"
  )
}
const zed = path.join(renderer, "zed")
if (!existsSync(path.join(zed, ".git"))) {
  throw new Error(
    "Renderer zed submodule is not initialized. Run: git submodule update --init --recursive, then node scripts/gpuix-main/build.mjs"
  )
}
const native = path.join(renderer, "packages/native")
const target = path.join(native, "build/cargo")
mkdirSync(target, { recursive: true })
const env = {
  ...process.env,
  CARGO_TARGET_DIR: target,
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? (process.platform === "win32" ? "3" : "6"),
}
const features =
  process.platform === "darwin" && mode === "runtime"
    ? "test-support,gpui_platform/runtime_shaders"
    : "test-support"

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.signal})`)
}

const react = path.join(renderer, "packages/react")
run("bun", ["install", "--frozen-lockfile"], renderer)
if (process.platform === "win32") repairDependencyJunctions(renderer)
run("rustc", ["-vV"], native)
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
    features,
  ],
  native
)
run("bun", ["run", "build:js"], native)
const binary = path.join(
  native,
  `gpuix-native.${process.platform}-${process.arch}${process.platform === "win32" ? "-msvc" : ""}.node`
)
if (!existsSync(binary) || statSync(binary).size === 0)
  throw new Error(`Native renderer build output missing: ${binary}`)
run("bun", ["run", "build"], react)
console.log(`Built gpuix ${process.platform}/${process.arch} (${mode}) at ${renderer}`)
