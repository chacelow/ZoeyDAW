import { spawnSync } from "node:child_process"
import { existsSync, lstatSync } from "node:fs"
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import lock from "./native-source.lock.json" with { type: "json" }

const repository = fileURLToPath(new URL("../../", import.meta.url))
const tracktion = path.join(repository, lock.tracktion.source)
const juce = path.join(repository, lock.juce.source)

function git(args) {
  // Developer tool selected from the developer's PATH; arguments never pass through a shell.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const result = spawnSync("git", args, { encoding: "utf8" })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "git failed")
  return result.stdout.trim()
}
function pathExists(location) {
  try {
    lstatSync(location)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

const requiredTracktionFiles = [
  "CMakeLists.txt",
  "tracktion_core/tracktion_core.h",
  "tracktion_engine/tracktion_engine.h",
  "tracktion_graph/tracktion_graph.h",
  "3rd_party/choc/LICENSE.md",
  "tracktion_graph/3rd_party/farbot/LICENSE",
  "tracktion_engine/3rd_party/signalsmith-stretch/LICENSE.txt",
]
if (
  requiredTracktionFiles.some(file => !existsSync(path.join(tracktion, file))) ||
  !existsSync(path.join(repository, lock.tracktion.license))
)
  throw new Error(
    "Maintained Tracktion source or bundled licenses are missing; restore them from the repository"
  )

await mkdir(path.dirname(juce), { recursive: true })
if (!pathExists(juce)) {
  const temporary = await mkdtemp(path.join(path.dirname(juce), ".juce-fetch-"))
  const checkout = path.join(temporary, "source")
  try {
    git(["clone", "--no-checkout", lock.juce.repository, checkout])
    git(["-C", checkout, "checkout", "--detach", lock.juce.commit])
    if (git(["-C", checkout, "rev-parse", "HEAD"]) !== lock.juce.commit)
      throw new Error("Fetched JUCE does not match its pinned commit")
    if (
      !existsSync(path.join(checkout, "CMakeLists.txt")) ||
      !existsSync(path.join(checkout, "LICENSE.md")) ||
      !existsSync(path.join(checkout, "JUCE.spdx.json"))
    )
      throw new Error("Fetched JUCE checkout is incomplete")
    if (pathExists(juce)) throw new Error("JUCE appeared during setup; refusing to replace it")
    await rename(checkout, juce)
  } finally {
    // Only the newly created private directory is removed; an existing checkout is never reset.
    await rm(temporary, { recursive: true, force: true })
  }
}

if (!lstatSync(juce).isDirectory() || !existsSync(path.join(juce, ".git")))
  throw new Error("JUCE path is not a Git checkout; refusing to replace it")
if (path.resolve(git(["-C", juce, "rev-parse", "--show-toplevel"])) !== path.resolve(juce))
  throw new Error("JUCE checkout root does not match the pinned source path")
if (git(["-C", juce, "rev-parse", "HEAD"]) !== lock.juce.commit)
  throw new Error("JUCE checkout has a different commit; refusing to reset it")
if (
  !existsSync(path.join(juce, "CMakeLists.txt")) ||
  !existsSync(path.join(juce, "LICENSE.md")) ||
  !existsSync(path.join(juce, "JUCE.spdx.json"))
)
  throw new Error("Pinned JUCE checkout is incomplete")
if (git(["-C", juce, "status", "--porcelain=v1", "--untracked-files=all"]))
  throw new Error(
    "Pinned JUCE checkout contains local changes or untracked files; refusing to reset it"
  )

console.log(
  JSON.stringify({
    tracktionCommit: lock.tracktion.commit,
    juceCommit: lock.juce.commit,
    tracktion,
    juce,
    license:
      "Tracktion GPL-3.0-or-later/commercial; JUCE 9 AGPL-3.0/commercial; no distribution authorization inferred",
  })
)
