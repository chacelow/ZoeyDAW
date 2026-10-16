import { expect, mock, test } from "bun:test"

const rejected = new Error("only absolute http/https URLs may be opened")
mock.module("@zoeydaw/native", () => ({
  openExternalHttpUrl() {
    throw rejected
  },
}))
const { openExternalUrl } = await import("./index")

test("a native rejection propagates without translation or suppression", () => {
  expect(() => openExternalUrl("javascript:alert(1)")).toThrow(rejected)
})
