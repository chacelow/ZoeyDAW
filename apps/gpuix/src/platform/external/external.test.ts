import { expect, mock, test } from "bun:test"

// The real binding launches the system browser; the port only has to surface Rust's verdict.
const opened: string[] = []
mock.module("@zoeydaw/native", () => ({
  openExternalHttpUrl(href: string) {
    if (!/^https?:\/\//u.test(href)) throw new Error("only absolute http/https URLs may be opened")
    opened.push(href)
  },
}))
const { openExternalUrl } = await import("./index")

test("a native rejection propagates to the caller and nothing is opened", () => {
  expect(() => openExternalUrl("javascript:alert(1)")).toThrow(/http\/https/u)
  expect(opened).toEqual([])
  openExternalUrl("https://github.com")
  expect(opened).toEqual(["https://github.com"])
})
