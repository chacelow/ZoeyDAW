import { describe, expect, it } from "vitest"
import { createPlayheadProjection } from "./playhead-projection"

describe("playhead projection", () => {
  it("returns the latest playhead frame and bumps revision on each write", () => {
    const rb = createPlayheadProjection()
    const initial = rb.readRevision()
    rb.writePlayhead({ bar: 2.5, playing: true, recording: false })
    const first = rb.readPlayhead()
    expect(first.bar).toBeCloseTo(2.5)
    expect(first.playing).toBe(true)
    expect(first.recording).toBe(false)
    expect(first.revision).toBe(initial + 1)
    rb.writePlayhead({ bar: 3, playing: true, recording: true })
    expect(rb.readPlayhead()).toMatchObject({
      bar: 3,
      playing: true,
      recording: true,
      revision: initial + 2,
    })
  })

  it("keeps 1/16384-note cursor precision at later bars", () => {
    const ring = createPlayheadProjection()
    const exact = 129 + 1 / 65_536
    ring.writePlayhead({ bar: exact, playing: true, recording: false })
    expect(ring.readPlayhead().bar).toBe(exact)
    const oddMeterBar = 257 + 3 / (7 * 16_384)
    ring.writePlayhead({ bar: oddMeterBar, playing: true, recording: true })
    expect(ring.readPlayhead().bar).toBe(oddMeterBar)
    ring.dispose()
  })
})
