import { existsSync, lstatSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const renderer = path.join(root, "vendor/gpuix")
if (!existsSync(path.join(renderer, ".git")) || !existsSync(path.join(renderer, "zed/.git"))) {
  console.error(
    "gpuix renderer submodules are missing. Run: git submodule update --init --recursive"
  )
  process.exit(1)
}

// Script probes under scripts/gpuix-main/* (test-window, ci-geometry, ...) import the app's
// React and renderer packages; each directory with a tsconfig.json resolves them through a
// node_modules link to apps/gpuix.
const target = path.join(root, "apps/gpuix/node_modules")
const probes = path.join(root, "scripts/gpuix-main")
for (const entry of readdirSync(probes, { withFileTypes: true })) {
  if (!entry.isDirectory() || !existsSync(path.join(probes, entry.name, "tsconfig.json"))) continue
  const link = path.join(probes, entry.name, "node_modules")
  const current = lstatSync(link, { throwIfNoEntry: false })
  if (current) {
    if (!current.isSymbolicLink()) continue
    if (path.resolve(path.dirname(link), readlinkSync(link)) === target) continue
    rmSync(link)
  }
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir")
}
