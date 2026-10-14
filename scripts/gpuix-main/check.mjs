import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "../..")
const config = JSON.parse(readFileSync(path.join(directory, "config.json"), "utf8"))
const patch = readFileSync(path.join(directory, "patches/close-guard.patch"), "utf8")
const vendor = path.join(root, ".gpuix-main")
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

try {
  if (!existsSync(vendor)) throw new Error("Missing .gpuix-main build link")
  if (git(vendor, "rev-parse", "HEAD") !== config.revision) {
    throw new Error(`Expected gpuix ${config.revision}`)
  }
  if (git(path.join(vendor, "zed"), "rev-parse", "HEAD") !== config.zedRevision) {
    throw new Error(`Expected zed ${config.zedRevision}`)
  }
  if (git(vendor, "diff", "--binary", "HEAD") !== patch.trimEnd()) {
    throw new Error(
      "Vendor must contain exactly the checked-in close-guard patch, with no other changes"
    )
  }
  if (git(vendor, "ls-files", "--others", "--exclude-standard") !== "") {
    throw new Error("Refusing untracked vendor sources")
  }
  if (git(path.join(vendor, "zed"), "status", "--porcelain") !== "") {
    throw new Error("Refusing a modified zed submodule")
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
    patch: digest(patch),
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
  process.stdout.write(`gpuix ${config.revision}: patched native, host and React build verified\n`)
} catch (error) {
  process.stderr.write(
    `gpuix self-build prerequisite failed: ${error.message}\n` +
      "Run bash scripts/gpuix-main/build.sh before pnpm install --frozen-lockfile.\n" +
      "Do not install the npm renderer as a fallback; see docs/research/gpuix-main-build.md.\n"
  )
  process.exitCode = 1
}
