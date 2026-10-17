import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export function probeAudioCapability(root, env, output) {
  const cargo = path.join(
    env.CARGO_HOME ?? path.join(homedir(), ".cargo"),
    "bin",
    process.platform === "win32" ? "cargo.exe" : "cargo"
  )
  const result = spawnSync(
    cargo,
    [
      "run",
      "--locked",
      "--quiet",
      "--release",
      "-p",
      "zoeydaw-engine",
      "--bin",
      "audio-capability",
    ],
    { cwd: root, env, encoding: "utf8" }
  )
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`Audio capability probe exited ${result.status ?? result.signal}`)
  const observed = JSON.parse(result.stdout)
  const available =
    observed?.kind === "available" &&
    typeof observed.device === "string" &&
    observed.device.length > 0
  const unavailable =
    observed?.kind === "unavailable" &&
    typeof observed.reason === "string" &&
    observed.reason.length > 0
  if (!available && !unavailable)
    throw new TypeError("Audio capability probe returned an invalid result")
  if (env.ZOEYDAW_VERIFY_NO_AUDIO !== undefined && env.ZOEYDAW_VERIFY_NO_AUDIO !== "1")
    throw new TypeError("ZOEYDAW_VERIFY_NO_AUDIO only accepts 1")
  const effective =
    env.ZOEYDAW_VERIFY_NO_AUDIO === "1"
      ? {
          kind: "unavailable",
          reason:
            "Audio output is explicitly disabled for verification by ZOEYDAW_VERIFY_NO_AUDIO=1",
        }
      : observed
  writeFileSync(
    path.join(output, "audio-capability.json"),
    JSON.stringify({ observed, effective }, null, 2)
  )
  console.log(`Audio output capability: ${JSON.stringify(effective)}`)
  return effective
}
