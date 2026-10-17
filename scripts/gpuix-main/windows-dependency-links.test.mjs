import assert from "node:assert/strict"
import { createRequire } from "node:module"
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  findDependencyJunctionRepairs,
  repairDependencyJunctions,
} from "./windows-dependency-links.mjs"

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "gpuix junction é ")))
  const vendor = path.join(root, "vendor")
  mkdirSync(vendor)
  writeFileSync(
    path.join(vendor, "package.json"),
    JSON.stringify({ workspaces: ["packages/*", "examples"] })
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = relative => {
    const location = path.join(vendor, relative)
    mkdirSync(location, { recursive: true })
    return location
  }
  const link = (relative, target, type = "dir") => {
    const location = path.join(vendor, relative)
    mkdirSync(path.dirname(location), { recursive: true })
    symlinkSync(target, location, type)
    return location
  }
  return { root, vendor, directory, link }
}

test("root, scoped, workspace and nested store dependencies resolve through the checkout junction", t => {
  const f = fixture(t)
  const react = f.directory("node_modules/.bun/react@1/node_modules/react")
  const reconciler = f.directory("node_modules/.bun/reconciler@1/node_modules/react-reconciler")
  writeFileSync(path.join(react, "index.js"), 'module.exports = { version: "fixture" }\n')
  writeFileSync(path.join(reconciler, "index.js"), 'module.exports = require("react")\n')
  const links = [
    f.link("node_modules/react", path.relative(path.join(f.vendor, "node_modules"), react)),
    f.link(
      "node_modules/react-reconciler",
      path.relative(path.join(f.vendor, "node_modules"), reconciler)
    ),
    f.link(
      "node_modules/.bun/reconciler@1/node_modules/react",
      path.relative(path.dirname(reconciler), react)
    ),
    f.link(
      "packages/react/node_modules/react",
      path.relative(path.join(f.vendor, "packages/react/node_modules"), react)
    ),
    f.link(
      "packages/react/node_modules/react-reconciler",
      path.relative(path.join(f.vendor, "packages/react/node_modules"), reconciler)
    ),
    f.link(
      "examples/node_modules/@fixture/react",
      path.relative(path.join(f.vendor, "examples/node_modules/@fixture"), react)
    ),
  ]
  const absolute = f.link("node_modules/already-absolute", react, "junction")
  const unchanged = readlinkSync(absolute)
  const file = path.join(react, "index.js")
  const fileLink = f.link(
    "node_modules/file.js",
    path.relative(path.join(f.vendor, "node_modules"), file),
    "file"
  )
  const originalFileLink = readlinkSync(fileLink)
  const alias = path.join(f.root, "vendor/gpuix")
  symlinkSync(f.vendor, alias, "junction")
  assert.equal(findDependencyJunctionRepairs(f.vendor).length, links.length)
  assert.equal(repairDependencyJunctions(f.vendor), links.length)
  for (const link of links) {
    assert.equal(path.isAbsolute(readlinkSync(link)), true)
    assert.equal(lstatSync(link).isSymbolicLink(), true)
  }
  assert.equal(readlinkSync(absolute), unchanged)
  assert.equal(readlinkSync(fileLink), originalFileLink)
  assert.equal(repairDependencyJunctions(f.vendor), 0)
  const rootRequire = createRequire(path.join(alias, "consumer.cjs"))
  const workspaceRequire = createRequire(path.join(alias, "packages/react/consumer.cjs"))
  const scopedRequire = createRequire(path.join(alias, "examples/consumer.cjs"))
  assert.equal(realpathSync(rootRequire.resolve("react")), path.join(react, "index.js"))
  assert.equal(rootRequire("react-reconciler"), rootRequire("react"))
  assert.equal(workspaceRequire("react-reconciler"), rootRequire("react"))
  assert.equal(scopedRequire("@fixture/react"), rootRequire("react"))
  assert.equal(
    readFileSync(path.join(alias, "node_modules/react/index.js"), "utf8"),
    readFileSync(file, "utf8")
  )
})

for (const canonicalEscape of [false, true]) {
  test(`directory targets cannot escape vendor, through another junction ${canonicalEscape}`, t => {
    const f = fixture(t)
    const outside = path.join(f.root, "outside")
    mkdirSync(outside)
    const real = f.directory("node_modules/real")
    const safe = f.link("node_modules/a-safe", "real")
    if (canonicalEscape) f.link("external", outside, "junction")
    const escaped = f.link(
      "node_modules/z-escape",
      canonicalEscape ? "../external" : "../../outside"
    )
    assert.throws(() => repairDependencyJunctions(f.vendor), /escapes the vendor checkout/)
    assert.equal(readlinkSync(safe), "real")
    assert.equal(path.isAbsolute(readlinkSync(escaped)), false)
    assert.equal(lstatSync(real).isDirectory(), true)
  })
}

test("a dangling directory link fails before changing any installed links", t => {
  const f = fixture(t)
  f.directory("node_modules/real")
  const safe = f.link("node_modules/a-safe", "real")
  const dangling = f.link("node_modules/z-missing", "missing")
  assert.throws(() => repairDependencyJunctions(f.vendor), { code: "ENOENT" })
  assert.equal(readlinkSync(safe), "real")
  assert.equal(readlinkSync(dangling), "missing")
})

test("absolute links are not traversed or rewritten, including outside directories", t => {
  const f = fixture(t)
  const outside = path.join(f.root, "outside")
  mkdirSync(path.join(outside, "target"), { recursive: true })
  const externalRelative = path.join(outside, "relative")
  symlinkSync("target", externalRelative, "dir")
  const external = f.link("node_modules/external", outside, "junction")
  const original = readlinkSync(external)
  assert.equal(repairDependencyJunctions(f.vendor), 0)
  assert.equal(readlinkSync(external), original)
  assert.equal(readlinkSync(externalRelative), "target")
})

test("a linked install root is rejected instead of following it", t => {
  const f = fixture(t)
  const outside = path.join(f.root, "outside")
  mkdirSync(outside)
  f.link("node_modules", outside, "junction")
  assert.throws(
    () => repairDependencyJunctions(f.vendor),
    /Expected a physical dependency directory/
  )
})

for (const state of ["missing", "relative", "junction"]) {
  test(`an interrupted replacement converges from ${state} with its original target preserved`, t => {
    const f = fixture(t)
    const real = f.directory("node_modules/real")
    const link = f.link("node_modules/react", "real")
    const backup = `${link}.gpuix-relative-link`
    renameSync(link, backup)
    if (state === "relative") symlinkSync("real", link, "dir")
    if (state === "junction") symlinkSync(real, link, "junction")
    assert.equal(repairDependencyJunctions(f.vendor), 1)
    assert.equal(realpathSync(link), real)
    assert.equal(path.isAbsolute(readlinkSync(link)), true)
    assert.throws(() => lstatSync(backup), { code: "ENOENT" })
    assert.equal(repairDependencyJunctions(f.vendor), 0)
  })
}

for (const replacement of ["other-target", "physical-directory"]) {
  test(`interrupted repair refuses an unrelated ${replacement}`, t => {
    const f = fixture(t)
    f.directory("node_modules/real")
    const link = f.link("node_modules/react", "real")
    const backup = `${link}.gpuix-relative-link`
    renameSync(link, backup)
    if (replacement === "other-target") {
      f.directory("node_modules/other")
      symlinkSync("other", link, "dir")
    } else mkdirSync(link)
    assert.throws(() => repairDependencyJunctions(f.vendor), /differs from its interrupted repair/)
    assert.equal(readlinkSync(backup), "real")
    assert.equal(lstatSync(link).isDirectory(), replacement === "physical-directory")
  })
}
