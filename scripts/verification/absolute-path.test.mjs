import assert from "node:assert/strict"
import { test } from "node:test"
import { withAbsolutePathFixture } from "./absolute-path-fixture.mjs"

const literal = (...parts) => `/${parts.join("/")}/fixture`
const roots = [
  literal("Volumes", "disk"),
  literal("Users", "person"),
  literal("tmp"),
  literal("private", "tmp"),
  literal("var", "folders", "aa"),
]
const extensions = ["mjs", "js", "ts", "tsx", "sh", "rs", "json"]
const resultText = result => `${result.stdout}\n${result.stderr}`

function assertHard(result, file) {
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 1, resultText(result))
  assert.match(result.stdout, new RegExp(`HARD\\s+absolute-path\\s+${file.replaceAll(".", "\\.")}`))
}

function assertClean(result) {
  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, resultText(result))
  assert.doesNotMatch(result.stdout, /HARD\s+absolute-path/)
  assert.match(result.stdout, /0 hard/)
}

test("changed-file scan flags machine-specific source and comment paths", () => {
  withAbsolutePathFixture(({ base, write, commit, scan }) => {
    write("scripts/absolute-sample.sh", `#!/bin/sh\n# usage: ${roots[0]}\necho '${roots[1]}'\n`)
    commit("scripts/absolute-sample.sh")
    const result = scan(base)
    assertHard(result, "scripts/absolute-sample.sh")
    assert.match(result.stdout, /2 hard, 0 warn/)
  })
})

test("full scan covers every tracked source extension and machine-specific root", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    const files = extensions.map((extension, index) => {
      const file = `scripts/absolute-${index}.${extension}`
      write(file, `// usage: ${roots[index % roots.length]}\n`)
      return file
    })
    commit(...files)
    const result = scan("--absolute-paths")
    for (const file of files) assertHard(result, file)
    assert.match(result.stdout, new RegExp(`${files.length} hard, 0 warn`))
  })
})
test("full scan catches a bad tracked file unchanged since the comparison base", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    write("scripts/old.rs", `// ${roots[4]}\n`)
    const base = commit("scripts/old.rs")
    assertHard(scan("--absolute-paths"), "scripts/old.rs")
    assertClean(scan(base))
  })
})

test("full scan skips evidence, markdown, and untracked files", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    write("evidence/nested/sample.js", `// ${roots[0]}\n`)
    write("docs/sample.md", roots[1])
    write("scripts/untracked.ts", `// ${roots[2]}\n`)
    commit("evidence/nested/sample.js", "docs/sample.md")
    assertClean(scan("--absolute-paths"))
  })
})

test("full scan ignores file URL fixture data and relative non-path references", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    write(
      "scripts/relative.js",
      [
        `const fixture = "file://${roots[1]}"`,
        'const relative = "./Users/person/fixture"',
        'const label = "prefix/Volumes/disk/fixture"',
        'const temporary = "tmp/cache"',
        'const unrelated = "/var/log/system.log"',
        "",
      ].join("\n")
    )
    commit("scripts/relative.js")
    assertClean(scan("--absolute-paths"))
  })
})

test("full scan does not invoke unrelated gpuix lint or slice checks", () => {
  withAbsolutePathFixture(({ base, write, commit, scan }) => {
    write("apps/gpuix/src/app/Root.tsx", "export const screen: any = null\n")
    commit("apps/gpuix/src/app/Root.tsx")
    assertClean(scan("--absolute-paths", base))
  })
})

test("shell default expansions are rejected without flagging relative path segments", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    write("scripts/defaults.sh", `cache="\${CACHE:-${roots[0]}}"\n`)
    commit("scripts/defaults.sh")
    assertHard(scan("--absolute-paths"), "scripts/defaults.sh")
    write("scripts/defaults.sh", 'echo "prefix-/Users/person"\n')
    assertClean(scan("--absolute-paths"))
  })
})

test("bare machine roots in shell fallback values are rejected", () => {
  withAbsolutePathFixture(({ write, commit, scan }) => {
    const bareRoots = ["Volumes", "Users", "tmp", "private", "var/folders"].map(root => `/${root}`)
    write(
      "scripts/bare-defaults.sh",
      bareRoots.map(root => `cache="\${CACHE:-${root}}"`).join("\n")
    )
    commit("scripts/bare-defaults.sh")
    const result = scan("--absolute-paths")
    assertHard(result, "scripts/bare-defaults.sh")
    assert.match(result.stdout, /5 hard, 0 warn/)
  })
})
