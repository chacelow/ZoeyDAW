import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const source = import.meta.dirname
const git = (cwd, ...args) =>
  execFileSync("/usr/bin/git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd()

export function buildFixture() {
  const workspace = mkdtempSync(path.join(tmpdir(), "gpuix-build-contract-"))
  const root = path.join(workspace, "repo")
  const scripts = path.join(root, "scripts/gpuix-main")
  const vendorRoot = path.join(workspace, "_vendor/zoeydaw-gpuix")
  const checkout = path.join(root, "checkout")
  mkdirSync(path.join(scripts, "patches"), { recursive: true })
  mkdirSync(path.join(checkout, "zed"), { recursive: true })
  git(root, "init", "--quiet")
  for (const name of ["check.mjs", "build.sh", "paths.mjs"])
    copyFileSync(path.join(source, name), path.join(scripts, name))
  for (const repo of [path.join(checkout, "zed"), checkout]) {
    git(repo, "init", "--quiet")
    git(repo, "config", "user.name", "Renderer contract")
    git(repo, "config", "user.email", "contract@localhost")
    writeFileSync(path.join(repo, "source.txt"), "reviewed source\n")
    writeFileSync(path.join(repo, ".gitignore"), "packages/\nnode_modules/\n")
    git(repo, "add", ".")
    git(repo, "commit", "--quiet", "-m", "fixture")
  }
  const revision = git(checkout, "rev-parse", "HEAD")
  const vendor = path.join(vendorRoot, revision)
  mkdirSync(vendorRoot, { recursive: true })
  symlinkSync(checkout, vendor)
  symlinkSync(vendor, path.join(root, ".gpuix-main"))
  writeFileSync(
    path.join(scripts, "config.json"),
    JSON.stringify({
      revision,
      zedRevision: git(path.join(vendor, "zed"), "rev-parse", "HEAD"),
      patches: [],
      zedPatches: [],
    })
  )
  const outputs = [
    "packages/native/index.js",
    "packages/native/index.d.ts",
    `packages/native/gpuix-native.${process.platform}-${process.arch}.node`,
    "packages/native/dist/host.js",
    "packages/native/dist/host.d.ts",
    "packages/native/dist/host-runtime.js",
    "packages/native/dist/host-runtime.d.ts",
    "packages/native/dist/renderer-state.js",
    "packages/native/dist/renderer-state.d.ts",
    "packages/native/dist/mutations.js",
    "packages/native/dist/mutations.d.ts",
    "packages/native/dist/testing.js",
    "packages/native/dist/testing.d.ts",
    "packages/native/dist/automation/index.js",
    "packages/native/dist/automation/index.d.ts",
    "packages/react/dist/index.js",
    "packages/react/dist/index.d.ts",
    "packages/react/dist/components/select.js",
    "packages/react/dist/components/select.d.ts",
    "packages/react/dist/testing.js",
    "packages/react/dist/testing.d.ts",
    "packages/react/jsx-runtime.js",
    "packages/react/jsx-runtime.d.ts",
    "packages/react/jsx-dev-runtime.js",
    "packages/react/jsx-dev-runtime.d.ts",
    "node_modules/react/package.json",
  ]
  for (const output of outputs) {
    mkdirSync(path.dirname(path.join(vendor, output)), { recursive: true })
    writeFileSync(
      path.join(vendor, output),
      output.endsWith(".json") ? "{}\n" : "export const reviewed = true\n"
    )
  }
  const check = (...args) =>
    spawnSync(process.execPath, [path.join(scripts, "check.mjs"), ...args], { encoding: "utf8" })
  return {
    root,
    scripts,
    vendorRoot,
    vendor,
    check,
    build: () =>
      spawnSync("/bin/bash", [path.join(scripts, "build.sh")], {
        encoding: "utf8",
        env: {
          ...process.env,
          GPUIX_VENDOR_ROOT: vendorRoot,
          CARGO_TARGET_DIR: path.join(root, "target"),
          CI: "true",
        },
      }),
    close: () => rmSync(workspace, { recursive: true, force: true }),
  }
}
