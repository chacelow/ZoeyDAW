import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitExecutable } from "../git.mjs"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const git = (root, ...args) =>
  execFileSync(gitExecutable(), args, { cwd: root, encoding: "utf8" }).trim()

export function withAbsolutePathFixture(scenario) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gpuix-absolute-path-"))
  try {
    mkdirSync(path.join(root, "scripts"))
    cpSync(
      path.join(projectRoot, "scripts/gpuix-review-scan.mjs"),
      path.join(root, "scripts/gpuix-review-scan.mjs")
    )
    mkdirSync(path.join(root, "scripts"), { recursive: true })
    cpSync(path.join(projectRoot, "scripts/git.mjs"), path.join(root, "scripts/git.mjs"))
    symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir")
    writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n')
    writeFileSync(
      path.join(root, "eslint.config.js"),
      'export default [{ files: ["**/*.ts"], rules: {} }]\n'
    )
    writeFileSync(path.join(root, "baseline"), "baseline\n")
    git(root, "init", "-q")
    git(root, "add", "baseline")
    git(
      root,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "baseline"
    )
    const base = git(root, "rev-parse", "HEAD")

    const write = (relative, body) => {
      const target = path.join(root, relative)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, body)
    }

    const commit = (...files) => {
      git(root, "add", "--", ...files)
      git(
        root,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture files"
      )
      return git(root, "rev-parse", "HEAD")
    }

    const scan = (...args) => {
      return spawnSync(
        process.execPath,
        [path.join(root, "scripts/gpuix-review-scan.mjs"), ...args],
        {
          cwd: root,
          encoding: "utf8",
        }
      )
    }

    return scenario({ base, write, commit, scan })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
