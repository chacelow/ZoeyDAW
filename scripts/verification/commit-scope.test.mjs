import assert from "node:assert/strict"
import { test } from "node:test"
import { checkCommitMessage } from "./tooling-gates-fixture.mjs"

for (const [message, expected] of [
  ["fix(build): restore renderer output validation", 0],
  ["test: cover native build failure", 0],
  ["fix(build): restore renderer output validation\n\nbuild: explain release note", 0],
  ["feat: add panel fix: repair timeline", 1],
  ["fix(core): repair panel; test(core): add coverage", 1],
  ["feat: fix build pipeline", 0],
]) {
  test(`commit scope: ${message.split("\n")[0]}`, () => {
    const result = checkCommitMessage(message)
    assert.equal(result.error, undefined, result.error?.message)
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`)
    if (expected === 1) assert.match(result.stderr, /Conventional Commit/)
    else assert.doesNotMatch(result.stderr, /BLOCKED/)
  })
}
