import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gitExecutable } from "../gpuix-main/paths.mjs"

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../gpuix-ui-map.mjs")
const sourcePath = process.env.GPUIX_UI_MAP_SCRIPT ?? source
const mapPath = "docs/architecture/gpuix-ui-map.md"
const srcPath = "apps/gpuix/src"
const aPath = `${srcPath}/project/sections/arrangement/lane/ClipCard.tsx`
const bPath = `${srcPath}/project/sections/arrangement/lane/OtherCard.tsx`

const git = (root, ...args) =>
  execFileSync(gitExecutable(), ["-C", root, ...args], { encoding: "utf8" }).trimEnd()

const clip = `export function ClipCard({ card, clip }) {
  return <div testId={\`\${card.ghost ? "clip-ghost" : "clip-source"}-\${clip.id}\`} />
}
`
const baseline = id => `export function Card() { return <div testId="${id}" /> }
`

export function uiMapFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "gpuix-ui-map-"))
  try {
    mkdirSync(path.join(root, "scripts"))
    mkdirSync(path.dirname(path.join(root, mapPath)), { recursive: true })
    writeFileSync(path.join(root, "scripts/gpuix-ui-map.mjs"), readFileSync(sourcePath))
    mkdirSync(path.join(root, "scripts/gpuix-main"))
    copyFileSync(
      path.resolve(import.meta.dirname, "../gpuix-main/paths.mjs"),
      path.join(root, "scripts/gpuix-main/paths.mjs")
    )
    const put = (file, text) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      writeFileSync(path.join(root, file), text)
    }
    git(root, "init", "--quiet")
    git(root, "config", "user.name", "UI map verification")
    git(root, "config", "user.email", "ui-map-verification@localhost")
    put(`${srcPath}/app/router/route.ts`, 'export const routes = [{ kind: "project" }]\n')
    put(aPath, baseline("a-original"))
    put(bPath, baseline("b-original"))
    const run = (...args) =>
      spawnSync(process.execPath, [path.join(root, "scripts/gpuix-ui-map.mjs"), ...args], {
        cwd: root,
        encoding: "utf8",
      })
    const generated = run()
    assert.equal(generated.status, 0, generated.stderr)
    git(root, "add", "--", srcPath, mapPath)
    git(root, "commit", "--quiet", "-m", "initial map")
    return {
      root,
      aPath,
      bPath,
      mapPath,
      clip,
      baseline,
      put,
      git: (...args) => git(root, ...args),
      run,
      read: file => readFileSync(path.join(root, file), "utf8"),
      index: file => git(root, "show", `:${file}`),
      close: () => rmSync(root, { recursive: true, force: true }),
    }
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}
