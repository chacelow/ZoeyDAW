import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { buildFixture } from "./build-contract-fixture.mjs"
import { gitExecutable } from "./paths.mjs"

test("renderer identity accepts the MSVC artifact and rejects an ABI-less Windows filename", () => {
  const fixture = buildFixture()
  try {
    const native = path.join(fixture.vendor, "packages/native")
    const binding = path.join(native, "gpuix-native.win32-x64-msvc.node")
    writeFileSync(binding, "reviewed Windows MSVC fixture\n")
    const preload = path.join(fixture.root, "windows-host.mjs")
    // This exercises artifact selection, not Win32 execution or Windows path semantics.
    writeFileSync(
      preload,
      'Object.defineProperty(process, "platform", { value: "win32" }); Object.defineProperty(process, "arch", { value: "x64" });\n'
    )
    const check = () =>
      spawnSync(
        process.execPath,
        ["--import", preload, path.join(fixture.scripts, "check.mjs"), "--record"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            TEMP: fixture.root,
            TMP: fixture.root,
            GPUIX_GIT_EXECUTABLE: gitExecutable(),
          },
        }
      )
    const recorded = check()
    assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr)
    rmSync(binding)
    writeFileSync(path.join(native, "gpuix-native.win32-x64.node"), "wrong ABI fixture\n")
    const rejected = check()
    assert.notEqual(rejected.status, 0)
    assert.match(
      rejected.stderr,
      /Missing renderer output: packages\/native\/gpuix-native\.win32-x64-msvc\.node/
    )
  } finally {
    fixture.close()
  }
})
