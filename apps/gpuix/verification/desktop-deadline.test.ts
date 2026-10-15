import { expect, test } from "bun:test"
import { parseDesktopDeadline } from "./desktop-deadline"

const deadline = "2026-10-15T06:30:00Z"
const deadlineMs = Date.parse(deadline)

test("accepts a future explicit UTC deadline without changing its instant", () => {
  expect(parseDesktopDeadline(deadline, deadlineMs - 1)).toBe(deadlineMs)
})

test("rejects missing, malformed and ambiguous local deadlines", () => {
  for (const value of [undefined, "not-a-date", "2026-10-15T06:30:00"]) {
    expect(() => parseDesktopDeadline(value, deadlineMs - 1)).toThrow(Error)
  }
})

test("the exact end of an approved slot is already expired", () => {
  expect(() => parseDesktopDeadline(deadline, deadlineMs)).toThrow(Error)
  expect(() => parseDesktopDeadline(deadline, deadlineMs + 1)).toThrow(Error)
})
