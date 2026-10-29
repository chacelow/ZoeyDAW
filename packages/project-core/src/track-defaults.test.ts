import { describe, expect, it } from "vitest"
import { createTrack } from "./reducers"

describe("new track monitor defaults", () => {
  it("starts Audio tracks with monitoring off", () => {
    expect(createTrack("audio", [], undefined, 72).monitor).toBe("off")
  })

  it("starts MIDI tracks with automatic monitoring", () => {
    expect(createTrack("midi", [], undefined, 72).monitor).toBe("auto")
  })
})
