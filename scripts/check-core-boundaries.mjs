import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const allowedCrates = new Map([
  [
    "zoeydaw",
    new Set([
      "zoeydaw-media",
      "zoeydaw-project",
      "zoeydaw-browser",
      "zoeydaw-engine",
      "zoeydaw-plugin-host",
      "zoeydaw-plugin-abi",
    ]),
  ],
  ["zoeydaw-cli", new Set(["zoeydaw-engine", "zoeydaw-project"])],
  ["zoeydaw-project", new Set(["zoeydaw-media"])],
  ["zoeydaw-media", new Set()],
  ["zoeydaw-browser", new Set()],
  ["zoeydaw-engine", new Set(["zoeydaw-plugin-abi"])],
  ["zoeydaw-plugin-helper", new Set()],
  ["zoeydaw-plugin-host", new Set(["zoeydaw-plugin-abi"])],
  ["zoeydaw-plugin-abi", new Set()],
])
const forbiddenNative = new Map([
  ["model", new Set(["analysis", "runtime"])],
  ["analysis", new Set(["runtime"])],
  ["runtime", new Set(["analysis"])],
])

export function checkCargoBoundaries(metadata) {
  const errors = []
  const localPackages = new Map(
    metadata.packages.map(pkg => [path.dirname(pkg.manifest_path), pkg])
  )
  for (const [name, allowed] of allowedCrates) {
    const pkg = metadata.packages.find(item => item.name === name)
    if (!pkg) {
      errors.push(`Missing required workspace package: ${name}`)
      continue
    }
    for (const dependency of pkg.dependencies.filter(item => item.kind !== "dev")) {
      if (name !== "zoeydaw" && /^tauri(?:$|-)/.test(dependency.name)) {
        errors.push(`${name} cannot depend on ${dependency.name}`)
      }
      if (!dependency.path) continue
      const target = localPackages.get(path.resolve(dependency.path))
      if (!target || !allowed.has(target.name)) {
        errors.push(`${name} cannot depend on local package ${target?.name ?? dependency.name}`)
      }
    }
  }
  return errors
}

export function checkNativeBoundaries(sources) {
  const errors = []
  const files = new Set(sources.keys())
  for (const [file, source] of sources) {
    const layer = file.split("/")[0]
    const forbidden = forbiddenNative.get(layer)
    if (!forbidden) continue
    const uncommented = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    for (const match of uncommented.matchAll(/^\s*#\s*include\s*[<"]([^">]+)[">]/gm)) {
      const include = match[1]
      const candidates = [
        path.posix.join(path.posix.dirname(file), include),
        include,
        ...["model", "analysis", "runtime"].map(directory => path.posix.join(directory, include)),
      ]
      for (const target of new Set(candidates.filter(candidate => files.has(candidate)))) {
        if (forbidden.has(target.split("/")[0])) {
          errors.push(`${file} cannot include ${target}`)
        }
      }
    }
  }
  return errors
}

function nativeSources(root, directory = "") {
  const sources = new Map()
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name)
    if (entry.isDirectory() && entry.name !== "vendor") {
      for (const [file, source] of nativeSources(root, relative)) sources.set(file, source)
    } else if (entry.isFile() && /\.(?:h|hpp|c|cc|cpp|mm)$/.test(entry.name)) {
      sources.set(relative, readFileSync(path.join(root, relative), "utf8"))
    }
  }
  return sources
}

export function checkCoreBoundaries(root) {
  const metadata = JSON.parse(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Use the developer's selected Rust toolchain, like cargo check.
    execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
      cwd: root,
      encoding: "utf8",
    })
  )
  return [
    ...checkCargoBoundaries(metadata),
    ...checkNativeBoundaries(nativeSources(path.join(root, "crates/engine/native"))),
  ]
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = checkCoreBoundaries(fileURLToPath(new URL("../", import.meta.url)))
    if (errors.length) {
      console.error(errors.join("\n"))
      process.exitCode = 1
    } else {
      console.log("Core Rust and native dependency boundaries passed.")
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
