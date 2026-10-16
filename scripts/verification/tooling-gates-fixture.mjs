import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitExecutable } from "../gpuix-main/paths.mjs"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

function git(cwd, ...args) {
  return execFileSync(gitExecutable(), args, { cwd, encoding: "utf8" }).trim()
}

export function withScanFixture(scenario) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gpuix-tooling-scan-"))
  try {
    mkdirSync(path.join(root, "scripts"))
    mkdirSync(path.join(root, "apps/gpuix/src/app"), { recursive: true })
    cpSync(
      path.join(projectRoot, "scripts/gpuix-review-scan.mjs"),
      path.join(root, "scripts/gpuix-review-scan.mjs")
    )
    mkdirSync(path.join(root, "scripts/gpuix-main"))
    cpSync(
      path.join(projectRoot, "scripts/gpuix-main/paths.mjs"),
      path.join(root, "scripts/gpuix-main/paths.mjs")
    )
    symlinkSync(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    )
    writeFileSync(
      path.join(root, "eslint.config.js"),
      'export default [{ files: ["**/*.ts"], rules: {} }]\n'
    )
    writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n')
    writeFileSync(path.join(root, "baseline"), "baseline\n")
    git(root, "init", "-q")
    git(root, "add", "baseline")
    git(
      root,
      "-c",
      "user.name=Tooling Fixture",
      "-c",
      "user.email=tooling@example.invalid",
      "commit",
      "-qm",
      "baseline"
    )
    const base = git(root, "rev-parse", "HEAD")
    return scenario({
      root,
      base,
      scan(testBody) {
        const source = path.join(root, "apps/gpuix/src/app/gate.test.ts")
        writeFileSync(source, `import { describe, it, test } from "bun:test"\n${testBody}\n`)
        git(root, "add", "apps/gpuix/src/app/gate.test.ts")
        git(
          root,
          "-c",
          "user.name=Tooling Fixture",
          "-c",
          "user.email=tooling@example.invalid",
          "commit",
          "-qm",
          "test gate"
        )
        return spawnSync(
          process.execPath,
          [path.join(root, "scripts/gpuix-review-scan.mjs"), base],
          {
            cwd: root,
            encoding: "utf8",
          }
        )
      },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export function checkCommitMessage(message) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gpuix-tooling-commit-"))
  try {
    const messageFile = path.join(root, "COMMIT_EDITMSG")
    writeFileSync(messageFile, message)
    return spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts/check-commit-scope.mjs"), messageFile],
      {
        cwd: root,
        encoding: "utf8",
      }
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
