import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const roots = ["apps", "packages", "crates", "src-tauri/src", "scripts", "tooling"]
const sourceExtension = /\.(?:[cm]?[jt]sx?|rs|cpp|cc|c|h|hpp|mm|css)$/
const excluded =
  /(?:^|\/)(?:node_modules|target|dist|build|vendor|third_party|generated|\.git)(?:\/|$)|(?:^|[./_-])generated(?:[./_-]|$)/
export const fileSizeLimit = 800

export function countLines(source) {
  if (!source) return 0
  return source.split("\n").length - Number(source.endsWith("\n"))
}

export function collectSourceSizes(root) {
  const sizes = new Map()
  function visit(directory) {
    if (!existsSync(path.join(root, directory))) return
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`
      if (excluded.test(file)) continue
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && sourceExtension.test(file)) {
        sizes.set(file, countLines(readFileSync(path.join(root, file), "utf8")))
      }
    }
  }
  for (const directory of roots) visit(directory)
  return sizes
}

export function checkFileSizes(sizes, baseline) {
  const errors = []
  for (const [file, lines] of sizes) {
    const limit = baseline[file] ?? fileSizeLimit
    if (!Number.isInteger(limit) || limit <= fileSizeLimit) {
      if (Object.hasOwn(baseline, file)) errors.push(`${file}: invalid baseline ${limit}`)
    }
    if (lines > limit)
      errors.push(`${file}: ${lines} lines exceeds ${limit}; split by responsibility`)
  }
  return errors
}

function baselineGrowth(root, current) {
  const file = "tooling/file-size-baseline.json"
  let committed
  try {
    committed = JSON.parse(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- Inspect the developer-selected Git repository, matching the existing boundary checker.
      execFileSync("git", ["show", `HEAD:${file}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    )
  } catch {
    return []
  }
  return Object.entries(current).flatMap(([name, limit]) =>
    !Object.hasOwn(committed, name) || limit > committed[name]
      ? [`${name}: baseline may only decrease or be removed`]
      : []
  )
}

export function checkRepositoryFileSizes(root) {
  const baseline = JSON.parse(
    readFileSync(path.join(root, "tooling/file-size-baseline.json"), "utf8")
  )
  const sizes = collectSourceSizes(root)
  return { sizes, errors: [...checkFileSizes(sizes, baseline), ...baselineGrowth(root, baseline)] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url))
  const { sizes, errors } = checkRepositoryFileSizes(root)
  if (process.argv.includes("--report")) {
    for (const [file, lines] of [...sizes]
      .filter(([, lines]) => lines > 500)
      .sort((a, b) => b[1] - a[1])) {
      console.log(`${lines}\t${file}`)
    }
  }
  if (errors.length) {
    console.error(errors.join("\n"))
    process.exitCode = 1
  } else console.log(`File size check passed (${sizes.size} source files, limit ${fileSizeLimit}).`)
}
