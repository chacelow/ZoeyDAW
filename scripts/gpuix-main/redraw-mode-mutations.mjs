import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, realpathSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const root = process.env.GPUIX_VENDOR_ROOT
if (!root) throw new Error("Set GPUIX_VENDOR_ROOT to the isolated F7 vendor root")
const isolatedRoot = realpathSync(root)
if (
  isolatedRoot !== "/Volumes/PSSD/code/_vendor/f7-gpuix" &&
  !isolatedRoot.startsWith("/Volumes/PSSD/code/_vendor/f7-gpuix/")
)
  throw new Error("Mutation runner only accepts the isolated F7 vendor")
const vendor = path.join(isolatedRoot, "6a5c7c142ac32f9eb0caefe0121be995cfc18631")
const zed = path.join(vendor, "zed")
const source = path.join(zed, "crates/gpui/src/app.rs")
const original = readFileSync(source, "utf8")
const guard = "if !matches!(self.mode, GpuiMode::Production) {"
assert.equal(
  original.split(guard).length,
  2,
  "Expected exactly one registered production draw guard"
)
const environment = {
  ...process.env,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? "/Volumes/PSSD/code/_vendor/target-f7",
  CARGO_BUILD_JOBS: "6",
}
function run() {
  const result = spawnSync(
    path.join(homedir(), ".cargo/bin/cargo"),
    [
      "test",
      "-p",
      "gpui",
      "--lib",
      "--features",
      "test-support,gpui_platform/runtime_shaders",
      "app::test::flush_effects_",
      "--",
      "--nocapture",
      "--test-threads=1",
    ],
    {
      cwd: zed,
      env: environment,
      encoding: "utf8",
      timeout: 900000,
      maxBuffer: 16 * 1024 * 1024,
    }
  )
  if (result.error) throw result.error
  const output = `${result.stdout}${result.stderr}`
  process.stdout.write(output)
  return { status: result.status, output }
}
assert.equal(run().status, 0, "Fixed mode regressions must pass before mutations")
try {
  for (const mutation of [
    {
      name: "production-sync-draw",
      replacement: "if true {",
      killed: "production App::update must not synchronously render a dirty window",
      preserved: "flush_effects_test_mode_draws_synchronously",
    },
    {
      name: "test-mode-no-sync-draw",
      replacement: "if false {",
      killed: "test-mode App::update must synchronously render each dirty window",
      preserved: "flush_effects_production_mode_defers_draw_to_scheduled_frame",
    },
  ]) {
    writeFileSync(
      source,
      original.replace(guard, () => mutation.replacement)
    )
    const result = run()
    assert.notEqual(result.status, 0, `${mutation.name} survived`)
    assert.ok(
      result.output.includes(mutation.killed),
      `${mutation.name} failed for an unrelated reason`
    )
    assert.ok(
      result.output.includes(`${mutation.preserved} ... ok`),
      `${mutation.name} damaged the other runtime mode`
    )
    process.stdout.write(`KILLED ${mutation.name}\n`)
    writeFileSync(source, original)
  }
} finally {
  writeFileSync(source, original)
  assert.equal(
    readFileSync(source, "utf8"),
    original,
    "Mode mutations must restore the original source"
  )
  assert.equal(run().status, 0, "Restored GPUI mode regressions must pass")
}
