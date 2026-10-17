import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
export function createAbsolutePathFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zoeydaw-absolute-paths-"))
  cpSync(path.join(projectRoot, "scripts/git.mjs"), path.join(root, "scripts/git.mjs"), {
    recursive: true,
  })
  symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir")
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n')
  return { root, close: () => rmSync(root, { recursive: true, force: true }) }
}
