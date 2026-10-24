import { describe, expect, it } from "vitest"
import { formatRulerTime } from "./format"

describe("time ruler format", () => {
  it("keeps the m:ss shape for Time and adds millis only for sub-second steps", () => {
    expect(formatRulerTime(65.4, "time", false)).toBe("1:05")
    expect(formatRulerTime(65.4, "time", true)).toBe("1:05.400")
  })

  it("labels whole seconds in every frame format", () => {
    expect(formatRulerTime(3661, "24", false)).toBe("01:01:01:00")
    expect(formatRulerTime(3661, "25", false)).toBe("01:01:01:00")
    expect(formatRulerTime(3661, "30", false)).toBe("01:01:01:00")
  })

  it("drifts against wall clock in non-drop and tracks it in drop-frame", () => {
    expect(formatRulerTime(3600, "29.97-non-drop", false)).toBe("00:59:56:12")
    expect(formatRulerTime(3600, "29.97-drop", false)).toBe("01:00:00:00")
  })

  it("skips two frame labels each drop-frame minute except every tenth", () => {
    expect(formatRulerTime(60.06, "29.97-drop", false)).toBe("00:01:00:02")
    expect(formatRulerTime(600, "29.97-drop", false)).toBe("00:10:00:00")
    expect(formatRulerTime(60.06, "29.97-non-drop", false)).toBe("00:01:00:00")
  })

  it("clamps negative and non-finite input instead of emitting a broken label", () => {
    expect(formatRulerTime(-5, "25", false)).toBe("00:00:00:00")
    expect(formatRulerTime(Number.NaN, "time", true)).toBe("0:00.000")
  })
})
