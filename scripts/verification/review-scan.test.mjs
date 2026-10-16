import assert from "node:assert/strict"
import { test } from "node:test"
import { withScanFixture } from "./tooling-gates-fixture.mjs"

const normal = 'describe("active suite", () => { test("active test", () => {}) })'
const disabled = [
  ["suite skip", 'describe.skip("suite", () => { test("disabled", () => {}) })'],
  ["test skip", 'test.skip("disabled", () => {})'],
  ["it skip", 'it.skip("disabled", () => {})'],
  ["test todo", 'test.todo("disabled", () => {})'],
  ["it todo", 'it.todo("disabled", () => {})'],
  [
    "conditional suite skip",
    'describe.skipIf(true)("suite", () => { test("disabled", () => {}) })',
  ],
  ["conditional test skip", 'test.skipIf(true)("disabled", () => {})'],
  [
    "conditional suite todo",
    'describe.todoIf(true)("suite", () => { test("disabled", () => {}) })',
  ],
  ["conditional test todo", 'test.todoIf(true)("disabled", () => {})'],
  ["false conditional suite", 'describe.if(false)("suite", () => { test("disabled", () => {}) })'],
  ["false conditional test", 'test.if(false)("disabled", () => {})'],
  ["parameterized suite skip", 'describe.skip.each([1])("suite %i", () => {})'],
  ["parameterized test skip", 'test.each([1]).skip("test %i", () => {})'],
  ["concurrent test skip", 'test.concurrent.skip("disabled", () => {})'],
  ["computed suite skip", 'describe["skip"]("suite", () => {})'],
  ["test alias disabled", 'xit("disabled", () => {})'],
  ["suite todo", 'describe.todo("disabled")'],
  ["exclusive suite", 'describe.only("suite", () => {})'],
]

for (const [label, body] of [["ordinary suite", normal], ...disabled]) {
  test(`review scan: ${label}`, () => {
    withScanFixture(({ scan }) => {
      const result = scan(body)
      assert.equal(result.error, undefined, result.error?.message)
      if (label === "ordinary suite") {
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
        assert.doesNotMatch(result.stdout, /HARD\s+skipped-test/)
      } else {
        assert.equal(result.status, 1, `${label}: ${result.stdout}\n${result.stderr}`)
        assert.match(result.stdout, /HARD\s+skipped-test\s+apps\/gpuix\/src\/app\/gate\.test\.ts/)
        assert.match(result.stdout, /1 hard, 0 warn/)
      }
    })
  })
}

test("review scan ignores disabled API examples in strings and comments", () => {
  withScanFixture(({ scan }) => {
    const result = scan(`const help = "test.skip( is disabled"; // test.skip("example")\n${normal}`)
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.doesNotMatch(result.stdout, /HARD\s+skipped-test/)
  })
})
