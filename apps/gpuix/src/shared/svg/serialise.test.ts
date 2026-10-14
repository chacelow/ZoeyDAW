import { describe, expect, test } from "bun:test"
import { serialiseSvg } from "./serialise"

describe("serialiseSvg", () => {
  test("renders each node with its attributes inside a namespaced root", () => {
    const markup = serialiseSvg(
      [
        ["path", { d: "M0 0L1 1", fill: "none" }],
        ["circle", { cx: 2, cy: 3, r: 1 }],
      ],
      { viewBox: "0 0 24 24", attributes: { stroke: "currentColor" } }
    )
    expect(markup).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor">' +
        '<path d="M0 0L1 1" fill="none"/><circle cx="2" cy="3" r="1"/></svg>'
    )
  })

  test("drops lucide's `key` bookkeeping attribute", () => {
    expect(
      serialiseSvg([["path", { d: "M0 0", key: "abc" }]], { viewBox: "0 0 1 1" })
    ).not.toContain("key=")
  })

  test("no children still yields a valid empty document", () => {
    expect(serialiseSvg([], { viewBox: "0 0 1 1" })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'
    )
  })
})
