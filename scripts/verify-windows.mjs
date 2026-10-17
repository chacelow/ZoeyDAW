import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { probeAudioCapability } from "./gpuix-main/windows/audio-capability.mjs"

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("Windows verification requires a Windows x64 host")
}
const root = path.resolve(import.meta.dirname, "..")
const app = path.join(root, "apps/gpuix")
const output = path.resolve(
  process.env.B2_EVIDENCE_DIR ?? mkdtempSync(path.join(tmpdir(), "zoeydaw-windows-evidence-"))
)
mkdirSync(output, { recursive: true })
const vendor = path.join(root, "vendor/gpuix")
const env = {
  ...process.env,
  B2_EVIDENCE_DIR: output,
  GPUIX_WINDOWS_SMOKE_DRIVER: path.join(output, "window-driver.exe"),
  CARGO_TARGET_DIR: path.join(root, "target"),
}
const vendorNative = path.join(vendor, "packages/native")
const zed = path.join(vendor, "zed")

function run(name, command, args, cwd = root) {
  console.log(`\n== ${name}`)
  const renderer = cwd.startsWith(vendor)
  const result = spawnSync(command, args, {
    cwd,
    env: renderer ? { ...env, CARGO_TARGET_DIR: path.join(vendorNative, "build/cargo") } : env,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal}`)
}

if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error("The native Windows lifecycle driver is compiled only on Windows Actions")
run("Windows User32 lifecycle driver", "rustc", [
  "--edition=2021",
  "-C",
  "opt-level=1",
  path.join(root, "scripts/gpuix-main/windows/window-driver.rs"),
  "-o",
  env.GPUIX_WINDOWS_SMOKE_DRIVER,
])

run("renderer build", process.execPath, ["scripts/check-gpuix.mjs"])
run("native bridge build", "bun", ["run", "build"], path.join(root, "crates/native"))
console.log("\n== Audio output capability")
const audioCapability = probeAudioCapability(root, env, output)
env.ZOEYDAW_VERIFY_AUDIO_CAPABILITY = JSON.stringify(audioCapability)
const checks = [
  ["Windows Rust check", "cargo", ["check", "--locked", "--workspace"]],
  ["Windows Rust contracts", "cargo", ["test", "--locked", "--workspace"]],
  [
    "Windows file URI mutation",
    process.execPath,
    ["crates/native/verification/mutations.mjs", "W1-file-uri"],
  ],
  [
    "Vendor Rust bridge contracts",
    "cargo",
    ["test", "--locked", "--release", "--features", "test-support"],
    vendorNative,
  ],
  [
    "GPUI first-present gate",
    "cargo",
    [
      "test",
      "--locked",
      "-p",
      "gpui",
      "--lib",
      "--features",
      "test-support",
      "async_pre_present_gate",
    ],
    zed,
  ],
  [
    "Windows restore generation",
    "cargo",
    [
      "test",
      "--locked",
      "-p",
      "gpui_windows",
      "--lib",
      "--features",
      "test-support",
      "windows_resume_tests",
    ],
    zed,
  ],
  ["TypeScript contracts", "bun", ["x", "tsc", "--noEmit"], app],
  [
    "Windows smoke TypeScript",
    "bun",
    [
      "x",
      "tsc",
      "--noEmit",
      "--project",
      path.join(root, "scripts/gpuix-main/windows/tsconfig.json"),
    ],
    app,
  ],
  ["Architecture lint", "bun", ["x", "eslint", "--max-warnings=0", "apps/gpuix/src"]],
  ["Architecture regressions", "bun", ["x", "vitest", "run", "tooling/eslint"]],
  ["Bun application contracts", "bun", ["test"], app],
  [
    "Offscreen scale and bounds",
    "bun",
    ["test", "scripts/gpuix-main/test-window/test-window.test.tsx"],
  ],
  [
    "DirectComposition window resource lifetime",
    "bun",
    ["test", "scripts/gpuix-main/windows/offscreen-lifecycle.test.tsx"],
  ],
  [
    "Anchored popup geometry",
    "bun",
    ["test", "scripts/gpuix-main/windows/anchored-geometry.test.tsx"],
  ],
  ["Production UI thread frame smoke", "bun", ["scripts/gpuix-main/windows/runtime.ts"]],
  ["Real backend offscreen smoke", "bun", ["scripts/gpuix-main/windows/smoke.tsx"]],
  [
    "Gallery screenshots",
    "bun",
    ["scripts/gpuix-main/ci-geometry/gallery.tsx", path.join(output, "gallery")],
  ],
]
const failures = []
for (const [name, command, args, cwd] of checks) {
  try {
    run(name, command, args, cwd)
  } catch (error) {
    failures.push(error)
    console.error(error)
  }
}
console.log(`Windows evidence: ${output}`)
if (failures.length) throw new AggregateError(failures, "Windows verification failed")
console.log(
  audioCapability.kind === "unavailable"
    ? `verify:windows passed with real-audio coverage UNVERIFIED: ${audioCapability.reason}`
    : "verify:windows passed"
)
