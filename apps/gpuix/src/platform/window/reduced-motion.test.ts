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

describe.if(process.platform === "darwin")("reduced motion through the real napi module", () => {
  test("the getter and the observer baseline both report the live system setting", async () => {
    const expected = systemSetting()
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
})
