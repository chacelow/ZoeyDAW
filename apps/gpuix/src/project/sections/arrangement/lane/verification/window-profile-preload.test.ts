import { afterEach, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const preload = path.resolve(import.meta.dir, "window-profile-preload.ts")

function execute(directory: string, deadline: string, output: string) {
  return spawnSync(
    process.execPath,
    ["--preload", preload, "-e", "process.stdout.write('entry-evaluated')"],
    {
      cwd: directory,
      env: {
        ...process.env,
        GPUIX_BACKGROUND: "1",
        LANE_STRESS: "1",
        LANE_WINDOW_PROFILE_DEADLINE: deadline,
        LANE_WINDOW_PROFILE_OUTPUT: output,
      },
      encoding: "utf8",
      timeout: 15000,
    }
  )
}

test("relative runner output writes its canonical startup receipt before entry evaluation", () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "window-profile-output-")))
  directories.push(directory)
  const output = "nested/evidence/result.json.local"
  const result = execute(directory, new Date(Date.now() + 300000).toISOString(), output)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain("entry-evaluated")
  const filename = path.join(directory, output)
  const receipt: unknown = JSON.parse(readFileSync(filename, "utf8"))
  if (!receipt || typeof receipt !== "object") throw new Error("Invalid startup receipt")
  expect(receipt).toMatchObject({
    phase: "preload-ready",
    output: filename,
    cwd: directory,
    records: [],
  })
  expect(result.stdout).toContain(`window-profile-output=${filename}`)
})

test("missing or expired UTC grant cannot write output or evaluate the window entry", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "window-profile-gate-"))
  directories.push(directory)
  const filename = path.join(directory, "unauthorized", "result.json.local")
  for (const deadline of ["", "2020-01-01T00:00:00Z"]) {
    const result = execute(directory, deadline, filename)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("future absolute UTC deadline before startup")
    expect(result.stdout).not.toContain("entry-evaluated")
    expect(existsSync(filename)).toBe(false)
  }
})
