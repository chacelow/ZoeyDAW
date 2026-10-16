import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { onReducedMotionChange } from "@zoeydaw/native"
import { getReducedMotion } from "./reduced-motion"

function systemSetting() {
  try {
    const value = execFileSync("/usr/bin/defaults", [
      "read",
      "com.apple.universalaccess",
      "reduceMotion",
    ])
    return value.toString().trim() === "1"
  } catch {
    return false
  }
}

describe("reduced motion through the real napi module", () => {
  test("the getter and the observer baseline both report the live system setting", async () => {
    const expected = process.platform === "darwin" ? systemSetting() : getReducedMotion()
    expect(getReducedMotion()).toBe(expected)

    const baseline = Promise.withResolvers<boolean>()
    let synchronous = true
    onReducedMotionChange(value => {
      expect(synchronous).toBe(false)
      baseline.resolve(value)
    })
    synchronous = false
    try {
      expect(await baseline.promise).toBe(expected)
    } finally {
      onReducedMotionChange(null)
    }
  })

  test("replacing and removing the native observer leaves the current getter usable", async () => {
    const first = Promise.withResolvers<boolean>()
    const second = Promise.withResolvers<boolean>()
    onReducedMotionChange(value => first.resolve(value))
    try {
      expect(await first.promise).toBe(getReducedMotion())
      onReducedMotionChange(value => second.resolve(value))
      expect(await second.promise).toBe(getReducedMotion())
    } finally {
      onReducedMotionChange(null)
    }
    expect(typeof getReducedMotion()).toBe("boolean")
  })
})
