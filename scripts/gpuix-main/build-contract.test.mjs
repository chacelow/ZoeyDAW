import assert from "node:assert/strict"
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { buildFixture } from "./build-contract-fixture.mjs"

for (const output of [
  "packages/native/dist/renderer-state.js",
  "packages/native/dist/host-runtime.js",
  "packages/native/dist/automation/index.d.ts",
  "packages/react/dist/testing.d.ts",
  "packages/react/jsx-dev-runtime.js",
]) {
  for (const operation of ["modify", "delete"]) {
    test(`identity gate rejects ${operation} of ${output}`, () => {
      const fixture = buildFixture()
      try {
        const recorded = fixture.check("--record")
        assert.equal(recorded.status, 0, recorded.stderr)
        const file = path.join(fixture.vendor, output)
        if (operation === "delete") rmSync(file)
        else writeFileSync(file, "export const unreviewed = true\n")
        const checked = fixture.check()
        assert.notEqual(checked.status, 0, `${operation} of ${output} passed the identity gate`)
        assert.match(checked.stderr, /Renderer outputs or patch changed|Missing renderer output/)
      } finally {
        fixture.close()
      }
    })
  }
}

test("a verified build links while another build owns the lock and leaves outputs untouched", () => {
  const fixture = buildFixture()
  try {
    assert.equal(fixture.check("--record").status, 0)
    const output = path.join(fixture.vendor, "packages/native/dist/renderer-state.js")
    const before = { text: readFileSync(output, "utf8"), mtime: statSync(output).mtimeMs }
    mkdirSync(path.join(fixture.vendorRoot, ".build-lock"))
    rmSync(path.join(fixture.root, ".gpuix-main"))
    const built = fixture.build()
    assert.equal(built.status, 0, built.stderr)
    assert.equal(readFileSync(output, "utf8"), before.text)
    assert.equal(statSync(output).mtimeMs, before.mtime)
    assert.equal(statSync(path.join(fixture.vendorRoot, ".build-lock")).isDirectory(), true)
    const checked = fixture.check()
    assert.equal(checked.status, 0, checked.stderr)
  } finally {
    fixture.close()
  }
})

test("an invalid build cannot link or overwrite artifacts while the build lock is owned", () => {
  const fixture = buildFixture()
  try {
    assert.equal(fixture.check("--record").status, 0)
    assert.notEqual(fixture.check("--build-mode", "precompiled").status, 0)
    const output = path.join(fixture.vendor, "packages/native/dist/renderer-state.js")
    const corrupted = "export const unreviewed = true\n"
    writeFileSync(output, corrupted)
    mkdirSync(path.join(fixture.vendorRoot, ".build-lock"))
    rmSync(path.join(fixture.root, ".gpuix-main"))
    const built = fixture.build()
    assert.notEqual(built.status, 0)
    assert.match(built.stderr, /Renderer outputs or patch changed/)
    assert.match(built.stderr, /Another gpuix build owns/)
    assert.equal(readFileSync(output, "utf8"), corrupted)
    assert.equal(statSync(path.join(fixture.vendorRoot, ".build-lock")).isDirectory(), true)
    assert.throws(() => statSync(path.join(fixture.root, ".gpuix-main")), { code: "ENOENT" })
  } finally {
    fixture.close()
  }
})
