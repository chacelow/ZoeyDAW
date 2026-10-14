import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "../..")
const config = JSON.parse(readFileSync(path.join(directory, "config.json"), "utf8"))
const patches = config.patches.map(name => ({
  name,
  content: readFileSync(path.join(directory, "patches", name), "utf8"),
}))
const pendingArgument = process.argv.indexOf("--pending")
const sourceArgument = Math.max(process.argv.indexOf("--sources"), pendingArgument)
const vendor =
  sourceArgument < 0 ? path.join(root, ".gpuix-main") : process.argv[sourceArgument + 1]
const outputs = [
  "packages/native/index.js",
  "packages/native/index.d.ts",
  `packages/native/gpuix-native.${process.platform}-${process.arch}.node`,
  "packages/native/dist/host.js",
  "packages/native/dist/host.d.ts",
  "packages/native/dist/testing.js",
  "packages/react/dist/index.js",
  "packages/react/dist/index.d.ts",
  "packages/react/dist/testing.js",
  "packages/react/jsx-runtime.js",
  "node_modules/react/package.json",
]
const digest = value => createHash("sha256").update(value).digest("hex")
const git = (directory, ...args) =>
  execFileSync("/usr/bin/git", ["-C", directory, ...args], { encoding: "utf8" }).trimEnd()

function expectedSourceDiffs() {
  const temporary = mkdtempSync(path.join(tmpdir(), "gpuix-patch-index-"))
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temporary, "index") }
  const indexedGit = (...args) =>
    execFileSync("/usr/bin/git", ["-C", vendor, ...args], { encoding: "utf8", env }).trimEnd()
  try {
    indexedGit("read-tree", config.revision)
    const diffs = [""]
    for (const patch of patches) {
      indexedGit("apply", "--cached", path.join(directory, "patches", patch.name))
      diffs.push(indexedGit("diff", "--binary", "--cached", "HEAD"))
    }
    return diffs
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

try {
  if (!existsSync(vendor)) throw new Error("Missing .gpuix-main build link")
  if (git(vendor, "rev-parse", "HEAD") !== config.revision) {
    throw new Error(`Expected gpuix ${config.revision}`)
  }
  if (git(path.join(vendor, "zed"), "rev-parse", "HEAD") !== config.zedRevision) {
    throw new Error(`Expected zed ${config.zedRevision}`)
  }
  const expectedDiffs = expectedSourceDiffs()
  const appliedCount = expectedDiffs.indexOf(git(vendor, "diff", "--binary", "HEAD"))
  if (appliedCount === -1 || (pendingArgument === -1 && appliedCount !== patches.length)) {
    throw new Error("Vendor must contain exactly the checked-in ordered patch series")
  }
  if (git(vendor, "ls-files", "--others", "--exclude-standard") !== "") {
    throw new Error("Refusing untracked vendor sources")
  }
  if (git(path.join(vendor, "zed"), "status", "--porcelain") !== "") {
    throw new Error("Refusing a modified zed submodule")
  }
  if (pendingArgument !== -1) {
    for (const patch of patches.slice(appliedCount)) process.stdout.write(`${patch.name}\n`)
    process.exit(0)
  }
  if (sourceArgument >= 0) {
    process.stdout.write(`Applied renderer patches verified: ${config.patches.join(", ")}\n`)
    process.exit(0)
  }
  const hashes = Object.fromEntries(
    outputs.map(output => {
      const filename = path.join(vendor, output)
      if (!existsSync(filename)) throw new Error(`Missing renderer output: ${output}`)
      return [output, digest(readFileSync(filename))]
    })
  )
  const metadataPath = `${realpathSync(vendor)}.build.json`
  const metadata = {
    revision: config.revision,
    zedRevision: config.zedRevision,
    patches: Object.fromEntries(patches.map(patch => [patch.name, digest(patch.content)])),
    platform: process.platform,
    arch: process.arch,
    outputs: hashes,
  }
  if (process.argv.includes("--record")) {
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  } else {
    if (!existsSync(metadataPath)) throw new Error("Missing renderer build manifest")
    const recorded = JSON.parse(readFileSync(metadataPath, "utf8"))
    if (JSON.stringify(recorded) !== JSON.stringify(metadata)) {
      throw new Error("Renderer outputs or patch changed since the recorded build")
    }
  }
  if (process.argv.includes("--resolution")) {
    const app = createRequire(path.join(root, "apps/gpuix/package.json"))
    const renderer = createRequire(path.join(vendor, "packages/react/package.json"))
    const reconciler = createRequire(renderer.resolve("react-reconciler"))
    const zustand = createRequire(app.resolve("zustand"))
    const ui = createRequire(path.join(root, "packages/ui/package.json"))
    const web = createRequire(path.join(root, "apps/web/package.json"))
    const resolved = {
      nativeApp: realpathSync(app.resolve("@gpuix/native/host")),
      nativeRenderer: realpathSync(renderer.resolve("@gpuix/native/host")),
      reactApp: realpathSync(app.resolve("react")),
      reactRenderer: realpathSync(renderer.resolve("react")),
      reactReconciler: realpathSync(reconciler.resolve("react")),
      reactZustand: realpathSync(zustand.resolve("react")),
      reactUi: realpathSync(ui.resolve("react")),
      reactWeb: realpathSync(web.resolve("react")),
    }
    if (resolved.nativeApp !== resolved.nativeRenderer) throw new Error("Multiple native renderers")
    if (
      [resolved.reactRenderer, resolved.reactReconciler, resolved.reactZustand].some(
        react => react !== resolved.reactApp
      )
    ) {
      throw new Error("Multiple React runtimes")
    }
    const webReact = web("react/package.json").version
    const webReactDom = web("react-dom/package.json").version
    const uiReact = ui("react/package.json").version
    const uiReactDom = ui("react-dom/package.json").version
    if (webReact !== webReactDom || uiReact !== uiReactDom) {
      throw new Error("Web/UI React and ReactDOM versions must match")
    }
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`)
  }
  process.stdout.write(
    `gpuix ${config.revision}: patched native, host and React build verified (${config.patches.join(", ")})\n`
  )
} catch (error) {
  process.stderr.write(
    `gpuix self-build prerequisite failed: ${error.message}\n` +
      "Run bash scripts/gpuix-main/build.sh before pnpm install --frozen-lockfile.\n" +
      "Do not install the npm renderer as a fallback; see docs/research/gpuix-main-build.md.\n"
  )
  process.exitCode = 1
}
