import { expect, mock, test } from "bun:test"

// The real binding launches the system browser; replace it to exercise a rejected native call.
const rejected = new Error("only absolute http/https URLs may be opened")
mock.module("@zoeydaw/native", () => ({
  openExternalHttpUrl() {
    throw rejected
  },
}))
// The test intentionally exercises module loading after replacing the native boundary.
const { openExternalUrl } = await import("./index")

test("a native rejection propagates without translation or suppression", () => {
  expect(() => openExternalUrl("javascript:alert(1)")).toThrow(rejected)
})
