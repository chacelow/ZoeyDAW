import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const repository = fileURLToPath(new URL("../../../../../", import.meta.url))
const [operation, first, second] = process.argv.slice(2)
const surfaces = ["gallery", "business"]

function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })
  if (result.status !== 0) throw new Error(`Capture failed: ${args.join(" ")}`)
}

if (operation === "capture" && first) {
  const output = path.resolve(first)
  mkdirSync(output, { recursive: true })
  const home = path.join(output, "home")
  mkdirSync(home, { recursive: true })
  const storage = {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_DATA_HOME: path.join(home, "data"),
  }
  run(["scripts/gpuix-main/ci-geometry/gallery.tsx", path.join(output, "gallery")], storage)
  run(
    [
      "--preload",
      "./apps/gpuix/src/app/verification/native-fixture.ts",
      "./apps/gpuix/src/app/verification/r1c-surfaces.tsx",
      path.join(output, "business"),
    ],
    { ...storage, B2_EVIDENCE_DIR: output }
  )
} else if (operation === "compare" && first && second) {
  const differences = []
  for (const surface of surfaces) {
    const before = path.resolve(first, surface)
    const after = path.resolve(second, surface)
    const names = readdirSync(before)
      .filter(name => name.endsWith(".png"))
      .sort((left, right) => left.localeCompare(right))
    const captured = readdirSync(after)
      .filter(name => name.endsWith(".png"))
      .sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(names) !== JSON.stringify(captured)) {
      throw new Error(`${surface}: screenshot combinations changed`)
    }
    if (names.length === 0) throw new Error(`${surface}: no captured screenshots`)
    for (const name of names) {
      const previous = readFileSync(path.join(before, name))
      const current = readFileSync(path.join(after, name))
      const equal = previous.equals(current)
      const sha256 = createHash("sha256").update(current).digest("hex")
      console.log(
        JSON.stringify({ surface, name, byteDifference: equal ? 0 : "different", sha256 })
      )
      if (!equal) differences.push(`${surface}/${name}`)
    }
  }
  if (differences.length) throw new Error(`Configuration changed pixels: ${differences.join(", ")}`)
} else {
  throw new Error(
    "Usage: bun apps/gpuix/src/app/verification/configuration-surfaces.mjs capture <external-directory> | compare <before-directory> <after-directory>"
  )
}
