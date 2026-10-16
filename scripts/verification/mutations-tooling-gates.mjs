import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { projectRoot } from "./tooling-gates-fixture.mjs"

function replaceOnce(file, original, mutation) {
  const text = readFileSync(file, "utf8")
  assert.ok(text.includes(original), `The fixed implementation is absent: ${file}`)
  assert.equal(text.split(original).length, 2, `Expected one mutation target: ${file}`)
  writeFileSync(
    file,
    text.replace(original, () => mutation)
  )
}

const mutations = [
  {
    name: "suite skip scanner",
    file: "scripts/gpuix-review-scan.mjs",
    from: "/^(describe|it|test)$/.test(node.name)",
    to: "/^(it|test)$/.test(node.name)",
    test: "scripts/verification/review-scan.test.mjs",
    pattern: "review scan: suite skip",
  },
  {
    name: "central SVG host exemption removed",
    file: "scripts/gpuix-review-scan.mjs",
    from: '    file !== "apps/gpuix/src/ui/controls/Icon/index.tsx" &&\n',
    to: "",
    test: "scripts/verification/review-scan.test.mjs",
    pattern: "central native SVG host",
  },
  {
    name: "central SVG host exemption broadened",
    file: "scripts/gpuix-review-scan.mjs",
    from: 'file !== "apps/gpuix/src/ui/controls/Icon/index.tsx"',
    to: '!file.startsWith("apps/gpuix/src/ui/controls/Icon")',
    test: "scripts/verification/review-scan.test.mjs",
    pattern: "central native SVG host",
  },
  {
    name: "unmapped gpuix DOM global",
    file: "tooling/eslint/gpuix-layers.js",
    from: 'file.includes("/apps/gpuix/src/")',
    to: "false",
    test: "tooling/eslint/gpuix-app-globals.test.js",
    pattern: "DOM globals are denied in apps/gpuix/src/app/Root.tsx",
    runner: "vitest",
  },
  {
    name: "ordinary commit type words",
    file: "scripts/check-commit-scope.mjs",
    from: "const typeHits = [...subject.matchAll(typePattern)].map(match => match[1])",
    to: `const typeHits = subject.match(new RegExp(\`\\\\b(\${CC_TYPES.join("|")})\\\\b\`, "gi")) ?? []`,
    test: "scripts/verification/commit-scope.test.mjs",
    pattern: "commit scope: fix\\(build\\): restore renderer output validation",
  },
]

for (const mutation of mutations) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gpuix-tooling-mutation-"))
  try {
    for (const file of [
      "scripts/gpuix-review-scan.mjs",
      "scripts/gpuix-main/paths.mjs",
      "scripts/check-commit-scope.mjs",
      "scripts/verification/tooling-gates-fixture.mjs",
      "scripts/verification/review-scan.test.mjs",
      "scripts/verification/commit-scope.test.mjs",
      "tooling/eslint/gpuix-layers.js",
      "tooling/eslint/gpuix-app-globals.test.js",
    ]) {
      const target = path.join(root, file)
      mkdirSync(path.dirname(target), { recursive: true })
      cpSync(path.join(projectRoot, file), target)
    }
    symlinkSync(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    )
    writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n')
    replaceOnce(path.join(root, mutation.file), mutation.from, mutation.to)
    const isVitest = mutation.runner === "vitest"
    const args = isVitest
      ? [
          path.join(root, "node_modules/vitest/vitest.mjs"),
          "run",
          mutation.test,
          "-t",
          mutation.pattern,
        ]
      : ["--test", "--test-reporter=tap", `--test-name-pattern=${mutation.pattern}`, mutation.test]
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" })
    assert.equal(result.error, undefined, `${mutation.name}: ${result.error?.message}`)
    assert.equal(
      result.status,
      1,
      `${mutation.name} survived or crashed unexpectedly:\n${result.stdout}\n${result.stderr}`
    )
    assert.match(
      result.stdout + result.stderr,
      /AssertionError/,
      `${mutation.name} must fail its targeted assertion rather than crash`
    )
    assert.match(
      result.stdout + result.stderr,
      isVitest ? /DOM globals are denied in/ : /not ok 1 - /,
      `${mutation.name} must fail the targeted test`
    )
    console.log(`Killed ${mutation.name}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
