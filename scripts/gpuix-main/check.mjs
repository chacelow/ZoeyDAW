import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitExecutable } from "./paths.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "../..")
const config = JSON.parse(readFileSync(path.join(directory, "config.json"), "utf8"))
const patches = config.patches.map(name => ({
  name,
  content: readFileSync(path.join(directory, "patches", name), "utf8"),
}))
const zedPatches = config.zedPatches.map(name => ({
  name,
  content: readFileSync(path.join(directory, "patches", name), "utf8"),
}))
const pendingArgument = process.argv.indexOf("--pending")
const sourceArgument = Math.max(process.argv.indexOf("--sources"), pendingArgument)
const vendorArgument = process.argv.indexOf("--vendor")
const vendor =
  sourceArgument >= 0
    ? process.argv[sourceArgument + 1]
    : vendorArgument !== -1
      ? process.argv[vendorArgument + 1]
      : path.join(root, ".gpuix-main")
const requiredOutputs = [
  "packages/native/index.js",
  "packages/native/index.d.ts",
  `packages/native/gpuix-native.${process.platform}-${process.arch}.node`,
  "packages/native/dist/host.js",
  "packages/native/dist/host.d.ts",
  "packages/native/dist/mutations.js",
  "packages/native/dist/mutations.d.ts",
  "packages/native/dist/testing.js",
  "packages/react/dist/index.js",
  "packages/react/dist/index.d.ts",
  "packages/react/dist/components/select.js",
  "packages/react/dist/components/select.d.ts",
  "packages/react/dist/testing.js",
  "packages/react/jsx-runtime.js",
  "packages/react/jsx-runtime.d.ts",
  "packages/react/jsx-dev-runtime.js",
  "packages/react/jsx-dev-runtime.d.ts",
  "node_modules/react/package.json",
]
const digest = value => createHash("sha256").update(value).digest("hex")
const git = (directory, ...args) =>
  execFileSync(gitExecutable(), ["-C", directory, ...args], { encoding: "utf8" }).trimEnd()

function compiledOutputs(directory) {
  return readdirSync(path.join(vendor, directory), { withFileTypes: true }).flatMap(entry => {
    const output = `${directory}/${entry.name}`
    return entry.isDirectory() ? compiledOutputs(output) : [output]
  })
}

function expectedSourceDiffs(repository, revision, series, submodules) {
  const temporary = mkdtempSync(path.join(tmpdir(), "gpuix-patch-index-"))
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "index") }
  const indexedGit = (...args) =>
    execFileSync(gitExecutable(), ["-C", repository, ...args], { encoding: "utf8", env }).trimEnd()
  try {
    indexedGit("read-tree", revision)
    const diffs = [""]
    for (const patch of series) {
      indexedGit("apply", "--cached", path.join(directory, "patches", patch.name))
      diffs.push(
        indexedGit("diff", `--ignore-submodules=${submodules}`, "--binary", "--cached", "HEAD")
      )
    }
    return diffs
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function appliedPrefix(repository, revision, series, label, submodules = "none") {
  const expectedDiffs = expectedSourceDiffs(repository, revision, series, submodules)
  const appliedCount = expectedDiffs.indexOf(
    git(repository, "diff", `--ignore-submodules=${submodules}`, "--binary", "HEAD")
  )
  if (appliedCount === -1 || (pendingArgument === -1 && appliedCount !== series.length)) {
    throw new Error(`${label} must contain exactly the checked-in ordered patch series`)
  }
  if (git(repository, "ls-files", "--others", "--exclude-standard") !== "") {
    throw new Error(`Refusing untracked ${label} sources`)
  }
  return appliedCount
}

try {
  if (!existsSync(vendor)) throw new Error("Missing .gpuix-main build link")
  if (git(vendor, "rev-parse", "HEAD") !== config.revision) {
    throw new Error(`Expected gpuix ${config.revision}`)
  }
  if (git(path.join(vendor, "zed"), "rev-parse", "HEAD") !== config.zedRevision) {
    throw new Error(`Expected zed ${config.zedRevision}`)
  }
  const appliedCount = appliedPrefix(vendor, config.revision, patches, "Vendor", "dirty")
  const zedAppliedCount = appliedPrefix(
    path.join(vendor, "zed"),
    config.zedRevision,
    zedPatches,
    "Zed"
  )
  if (pendingArgument !== -1) {
    for (const patch of patches.slice(appliedCount)) process.stdout.write(`${patch.name}\n`)
    for (const patch of zedPatches.slice(zedAppliedCount))
      process.stdout.write(`zed/${patch.name}\n`)
    process.exit(0)
  }
  if (sourceArgument >= 0) {
    process.stdout.write(
      `Applied renderer patches verified: ${config.patches.join(", ")}; zed: ${zedPatches.map(patch => patch.name).join(", ")}\n`
    )
    process.exit(0)
  }
  const outputs = [
    ...new Set([
      ...requiredOutputs,
      ...compiledOutputs("packages/native/dist"),
      ...compiledOutputs("packages/react/dist"),
    ]),
  ].sort((left, right) => left.localeCompare(right))
  const hashes = Object.fromEntries(
    outputs.map(output => {
      const filename = path.join(vendor, output)
      if (!existsSync(filename)) throw new Error(`Missing renderer output: ${output}`)
      return [output, digest(readFileSync(filename))]
    })
  )
  const metadataPath = `${realpathSync(vendor)}.build.json`
  const recording = process.argv.includes("--record")
  const recorded =
    !recording && existsSync(metadataPath)
      ? JSON.parse(readFileSync(metadataPath, "utf8"))
      : undefined
  const modeArgument = process.argv.indexOf("--build-mode")
  const buildMode =
    modeArgument !== -1 ? process.argv[modeArgument + 1] : (recorded?.buildMode ?? "runtime")
  if (!["runtime", "precompiled"].includes(buildMode))
    throw new Error("Unknown renderer build mode")
  const metadata = {
    revision: config.revision,
    zedRevision: config.zedRevision,
    patches: Object.fromEntries(patches.map(patch => [patch.name, digest(patch.content)])),
    zedPatches: Object.fromEntries(zedPatches.map(patch => [patch.name, digest(patch.content)])),
    platform: process.platform,
    arch: process.arch,
    buildMode,
    outputs: hashes,
  }
  if (recording) {
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  } else {
    if (!recorded) throw new Error("Missing renderer build manifest")
    if (JSON.stringify(recorded) !== JSON.stringify(metadata)) {
      throw new Error("Renderer outputs or patch changed since the recorded build")
    }
  }
  if (process.argv.includes("--resolution")) {
    const app = createRequire(path.join(root, "apps/gpuix/package.json"))
    const renderer = createRequire(path.join(vendor, "packages/react/package.json"))
    const reconciler = createRequire(renderer.resolve("react-reconciler"))
    const zustand = createRequire(app.resolve("zustand"))
    const resolved = {
      nativeApp: realpathSync(app.resolve("@gpuix/native/host")),
      nativeRenderer: realpathSync(renderer.resolve("@gpuix/native/host")),
      reactApp: realpathSync(app.resolve("react")),
      reactRenderer: realpathSync(renderer.resolve("react")),
      reactReconciler: realpathSync(reconciler.resolve("react")),
      reactZustand: realpathSync(zustand.resolve("react")),
    }
    if (resolved.nativeApp !== resolved.nativeRenderer) throw new Error("Multiple native renderers")
    if (
      [resolved.reactRenderer, resolved.reactReconciler, resolved.reactZustand].some(
        react => react !== resolved.reactApp
      )
    ) {
      throw new Error("Multiple React runtimes")
    }
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`)
  }
  process.stdout.write(
    `gpuix ${config.revision}: patched native, host and React build verified (${config.patches.join(", ")}; zed: ${zedPatches.map(patch => patch.name).join(", ")})\n`
  )
} catch (error) {
  process.stderr.write(
    `gpuix self-build prerequisite failed: ${error.message}\n` +
      "Run bash scripts/gpuix-main/build.sh before pnpm install --frozen-lockfile.\n" +
      "Do not install the npm renderer as a fallback; see docs/research/gpuix-main-build.md.\n"
  )
  process.exitCode = 1
}
