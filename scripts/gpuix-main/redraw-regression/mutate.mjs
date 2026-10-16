import { spawn } from "node:child_process"
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const { dirname, isAbsolute, join, relative, resolve, sep } = path

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const regression = join(repo, "scripts/gpuix-main/redraw-regression/run.mjs")
const sharedRoot = "/Volumes/PSSD/code/_vendor/zoeydaw-gpuix"
const guard = "if !matches!(self.mode, GpuiMode::Production) {"
const features = "test-support,gpui_platform/runtime_shaders"
const usage = `Isolated native production-draw mutation (macOS, real binary; no desktop control).

First prepare a FIXED isolated checkout using the repository build entrypoint:
  GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix \\
  CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 \\
  RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin CARGO_BUILD_JOBS=6 \\
    bash scripts/gpuix-main/build.sh

Then run this executable against that same already-owned isolated checkout:
  GPUIX_VENDOR_ROOT=/Volumes/PSSD/code/_vendor/f7-gpuix \\
  CARGO_TARGET_DIR=/Volumes/PSSD/code/_vendor/target-f7 \\
  RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin CARGO_BUILD_JOBS=6 \\
    node scripts/gpuix-main/redraw-regression/mutate.mjs

GPUIX_VENDOR_ROOT and CARGO_TARGET_DIR are required. Both must be isolated from
shared vendor/target and the repository. Source must already contain the F7
runtime guard. No separate clone is needed; use the primary owned F7 checkout.
Uses existing vendor Bun/napi dependencies; performs direct release napi rebuilds
with --features ${features}. It deliberately does not invoke build.sh on
mutated sources or rewrite repository manifests/symlinks. Only the flush_effects
runtime mode guard changes; native artifacts are rebuilt in that isolated checkout.
Baseline must pass. Production guard=true must fail specifically with exit 42
and native frame growth. GPUI mode-test mutations have a separate parent entrypoint.
Every mutation restores source and rebuilds the fixed binary in finally; the
restored production regression must pass. SIGINT/SIGTERM stop the active child
process group, then restore/rebuild before exiting unsuccessfully.
Logs and JSON are created under the system temp directory (outside git).
BUN_BIN may select Bun; default bun. Build timeout: 20min; regression: 30s.`

if (process.argv.includes("--help")) {
  console.log(usage)
  process.exit(0)
}
const unknown = process.argv.slice(2)
if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(" ")}; use --help`)

function inside(path, root) {
  const fromRoot = relative(root, path)
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  )
}

function canonical(path) {
  if (existsSync(path)) return realpathSync(path)
  return join(canonical(dirname(path)), path.slice(dirname(path).length + 1))
}

function replaceGuard(source, from, to) {
  const start = source.indexOf("    fn flush_effects(&mut self) {")
  const end = source.indexOf("    fn release_dropped_entities(", start)
  if (start === -1 || end < start) throw new Error("Cannot uniquely locate GPUI flush_effects")
  const section = source.slice(start, end)
  const anchor = `#[cfg(any(test, feature = "test-support", feature = "bench"))]\n                ${from}`
  if (section.split(anchor).length !== 2)
    throw new Error(`Expected exactly one cfg-adjacent runtime guard: ${from}`)
  return (
    source.slice(0, start) +
    section.replace(anchor, () => anchor.replace(from, () => to)) +
    source.slice(end)
  )
}

async function main() {
  let cancelChild
  let interrupted = false
  let restoring = false
  const onSignal = () => {
    interrupted = true
    if (!restoring) cancelChild?.()
  }
  if (process.platform !== "darwin") throw new Error("Requires macOS embedded production renderer")
  if (!process.env.GPUIX_VENDOR_ROOT || !process.env.CARGO_TARGET_DIR)
    throw new Error("Set explicit isolated GPUIX_VENDOR_ROOT and CARGO_TARGET_DIR; see --help")
  const vendorRoot = canonical(resolve(process.env.GPUIX_VENDOR_ROOT))
  const target = canonical(resolve(process.env.CARGO_TARGET_DIR))
  for (const [name, path] of [
    ["vendor root", vendorRoot],
    ["cargo target", target],
  ]) {
    if (
      inside(path, canonical(sharedRoot)) ||
      inside(path, realpathSync(repo)) ||
      inside(path, "/Volumes/PSSD/code/_vendor/target")
    ) {
      throw new Error(`Refusing shared/repository ${name}: ${path}`)
    }
  }
  if (!target.startsWith("/Volumes/PSSD/"))
    throw new Error("CARGO_TARGET_DIR must stay on /Volumes/PSSD")
  const jobs = process.env.CARGO_BUILD_JOBS || "6"
  if (!/^[1-6]$/.test(jobs)) throw new Error("CARGO_BUILD_JOBS must be between 1 and 6")
  const { revision } = JSON.parse(
    readFileSync(join(repo, "scripts/gpuix-main/config.json"), "utf8")
  )
  const vendor = realpathSync(join(vendorRoot, revision))
  if (!inside(vendor, vendorRoot))
    throw new Error("Vendor checkout escapes isolated root through a symlink")
  const app = realpathSync(join(vendor, "zed/crates/gpui/src/app.rs"))
  if (!inside(app, vendor)) throw new Error("GPUI app.rs escapes isolated vendor through a symlink")
  const nativeDir = realpathSync(join(vendor, "packages/native"))
  if (!inside(nativeDir, vendor))
    throw new Error("Native package escapes isolated vendor through a symlink")
  const original = readFileSync(app, "utf8")
  replaceGuard(original, guard, "if true {")
  const logDir = mkdtempSync(join(realpathSync(tmpdir()), "gpuix-redraw-mutation-"))
  if (inside(logDir, realpathSync(repo)))
    throw new Error("System temp directory is inside git; select an external TMPDIR")
  const env = {
    ...process.env,
    GPUIX_NATIVE_ENTRY: join(nativeDir, "index.js"),
    CARGO_TARGET_DIR: target,
    CARGO_BUILD_JOBS: jobs,
    RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN || "stable-aarch64-apple-darwin",
  }
  const lock = join(vendorRoot, ".build-lock")
  mkdirSync(lock)
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
  console.log(`Mutation evidence: ${logDir}`)
  const results = []

  async function command(label, executable, args, cwd, timeout = 1_200_000) {
    if (interrupted && !restoring) throw new Error("Interrupted; restoring fixed source and binary")
    const logPath = join(logDir, `${label}.log`)
    const fd = openSync(logPath, "wx")
    let timedOut = false
    let killTimer
    let timeoutTimer
    let child
    try {
      const result = await new Promise((resolve, reject) => {
        child = spawn(executable, args, { cwd, env, detached: true, stdio: ["ignore", fd, fd] })
        const kill = signal => {
          if (!child.pid) return
          try {
            process.kill(-child.pid, signal)
          } catch (error) {
            if (error.code !== "ESRCH") throw error
          }
        }
        const terminate = () => {
          kill("SIGTERM")
          killTimer = setTimeout(() => kill("SIGKILL"), 5000)
        }
        cancelChild = terminate
        timeoutTimer = setTimeout(() => {
          timedOut = true
          terminate()
        }, timeout)
        child.once("error", reject)
        child.once("close", (code, signal) => resolve({ code, signal }))
      })
      const entry = { label, command: [executable, ...args], cwd, logPath, ...result, timedOut }
      results.push(entry)
      if (timedOut || (interrupted && !restoring))
        throw new Error(`${label} ${timedOut ? "timed out" : "interrupted"}; see ${logPath}`)
      return entry
    } finally {
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      cancelChild = undefined
      closeSync(fd)
    }
  }

  async function build(label) {
    const result = await command(
      label,
      process.env.BUN_BIN || "bun",
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
      nativeDir
    )
    if (result.code !== 0) throw new Error(`Native rebuild failed: ${result.logPath}`)
  }

  async function runRegression(label, expectedCode) {
    const outcome = await command(label, process.env.BUN_BIN || "bun", [regression], repo, 30_000)
    const lines = readFileSync(outcome.logPath, "utf8").trim().split("\n")
    const evidence = lines
      .reverse()
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .find(value => value?.kind === "gpuix-production-redraw-regression")
    const expectedGrowth = expectedCode === 42
    if (
      outcome.code !== expectedCode ||
      !evidence ||
      evidence.exitCode !== expectedCode ||
      evidence.synchronousDrawGrowth !== expectedGrowth ||
      evidence.errors.length ||
      evidence.batches.map(batch => batch.calls).join(",") !== "1,64,512" ||
      evidence.batches.some(batch =>
        expectedGrowth ? batch.synchronousDraws <= 0 : batch.synchronousDraws !== 0
      )
    ) {
      throw new Error(
        `Expected regression exit ${expectedCode} with measured ${expectedGrowth ? "positive" : "zero"} draw growth: ${outcome.logPath}`
      )
    }
    return evidence
  }

  async function mutate(label, mutation, exercise) {
    const mutated = replaceGuard(original, guard, mutation)
    let changed = false
    try {
      if (readFileSync(app, "utf8") !== original)
        throw new Error("Isolated app.rs changed unexpectedly before mutation")
      writeFileSync(app, mutated)
      changed = true
      await build(`${label}-build`)
      await exercise()
    } finally {
      if (changed) {
        restoring = true
        try {
          const current = readFileSync(app, "utf8")
          writeFileSync(
            app,
            current === mutated ? original : replaceGuard(current, mutation, guard)
          )
          await build(`${label}-restore-build`)
          await runRegression(`${label}-restored-regression`, 0)
        } finally {
          restoring = false
        }
      }
    }
  }

  let failure
  try {
    await runRegression("fixed-baseline", 0)
    await mutate("production-sync", "if true {", () =>
      runRegression("production-sync-regression", 42)
    )
    if (interrupted) throw new Error("Interrupted; source and binary restoration completed")
  } catch (error) {
    failure = error
    throw error
  } finally {
    try {
      writeFileSync(
        join(logDir, "summary.json"),
        `${JSON.stringify({ vendor, target, features, interrupted, passed: !failure, error: failure?.stack, results }, null, 2)}\n`
      )
    } finally {
      rmdirSync(lock)
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
    }
  }
}

main().catch(error => {
  console.error(error.stack || String(error))
  process.exitCode = 1
})
