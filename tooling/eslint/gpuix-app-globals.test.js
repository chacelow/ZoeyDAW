import assert from "node:assert/strict"
import path from "node:path"
import { test } from "vitest"
import { Linter } from "eslint"
import * as parser from "@typescript-eslint/parser"
import { gpuixLayers } from "./gpuix-layers.js"

const linter = new Linter()
const options = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { architecture: { rules: { "gpuix-layers": gpuixLayers } } },
    rules: { "architecture/gpuix-layers": "error" },
  },
]

function lint(file, code) {
  const messages = linter.verify(code, options, {
    filename: path.join(import.meta.dirname, "../..", file),
  })
  assert.ok(!messages.some(message => message.fatal), JSON.stringify(messages))
  return messages.filter(message => message.ruleId === "architecture/gpuix-layers")
}

for (const file of [
  "apps/gpuix/src/app/Root.tsx",
  "apps/gpuix/src/main.tsx",
  "apps/gpuix/src/verification/probe.ts",
]) {
  test(`DOM globals are denied in ${file}`, () => {
    const violations = lint(
      file,
      "void window.innerWidth; void document.title; void navigator.userAgent"
    )
    assert.deepEqual(
      violations.map(message => message.messageId),
      Array(3).fill("runtimeGlobal")
    )
    for (const name of ["window", "document", "navigator"]) {
      assert.ok(
        violations.some(message => message.message.includes(`'${name}'`)),
        JSON.stringify(violations)
      )
    }
  })
}

for (const file of [
  "apps/gpuix/src/app/Root.tsx",
  "apps/gpuix/src/main.tsx",
  "apps/gpuix/src/verification/probe.ts",
]) {
  test(`shadowed globals remain legal in ${file}`, () => {
    assert.deepEqual(
      lint(
        file,
        "function read(window: { innerWidth: number }, document: { title: string }) { return window.innerWidth + document.title.length }"
      ),
      []
    )
    assert.deepEqual(
      lint(file, "const state = { document: { title: 'ok' } }; void state.document.title"),
      []
    )
  })
}

test("gpuix tests and non-gpuix files are exempt", () => {
  assert.deepEqual(lint("apps/gpuix/src/app/Root.test.tsx", "void window.innerWidth"), [])
  assert.deepEqual(lint("apps/gpuix/src/__tests__/entry.tsx", "void document.title"), [])
  assert.deepEqual(lint("apps/other/src/main.tsx", "void window.innerWidth"), [])
})
