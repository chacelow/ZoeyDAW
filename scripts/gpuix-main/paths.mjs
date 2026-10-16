import { execFileSync } from "node:child_process"
import { existsSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function canonicalBuildPath(value) {
  let ancestor = path.resolve(value)
  const suffix = []
  while (!existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  return path.join(realpathSync(ancestor), ...suffix)
}

export function sharedBuildPaths(repository) {
  const common = execFileSync(
    "/usr/bin/git",
    ["-C", repository, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" }
  ).trim()
  const base = canonicalBuildPath(path.resolve(path.dirname(common), "../_vendor"))
  return { base, vendorRoot: path.join(base, "zoeydaw-gpuix"), target: path.join(base, "target") }
}

export function isWithinBuildPath(value, root) {
  const relative = path.relative(root, value)
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const value =
    process.argv[2] === "--canonical"
      ? canonicalBuildPath(process.argv[3])
      : sharedBuildPaths(path.resolve(import.meta.dirname, "../..")).base
  process.stdout.write(`${value}\n`)
}
