import { copyFileSync, mkdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const target = process.env.CARGO_TARGET_DIR
if (!target || !path.isAbsolute(target))
  throw new Error("CARGO_TARGET_DIR must select an absolute private target")
const cargo =
  process.env.CARGO ??
  path.join(homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo")
const env = { ...process.env, CARGO_TARGET_DIR: target }
const build = spawnSync(cargo, ["build", "-p", "zoeydaw-native", "--features", "verification"], {
  cwd: root,
  env,
  stdio: "inherit",
})
if (build.status !== 0) process.exit(build.status ?? 1)
const library =
  process.platform === "darwin"
    ? "libzoeydaw_native.dylib"
    : process.platform === "win32"
      ? "zoeydaw_native.dll"
      : "libzoeydaw_native.so"
const output = path.join(target, "verification", "zoeydaw-native.node")
mkdirSync(path.dirname(output), { recursive: true })
copyFileSync(path.join(target, "debug", library), output)
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-reporter=tap",
    ...process.argv.slice(2),
    fileURLToPath(new URL("resources.test.mjs", import.meta.url)),
  ],
  {
    cwd: root,
    env: { ...env, ZOEYDAW_VERIFICATION_NATIVE: output },
    stdio: "inherit",
  }
)
process.exit(result.status ?? 1)
