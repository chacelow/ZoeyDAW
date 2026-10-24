import { describe, expect, it } from "vitest"
import { jsonU64Schema, realtimeEventSchema, recordingStateSchema } from "./protocol.generated"

const context = {
  sessionId: "session",
  sessionEpoch: 1,
  streamId: 2,
  deviceEpoch: 3,
  generation: 4,
  registryRevision: 5,
  seq: "9007199254740993",
}

describe("realtime metadata boundaries", () => {
  it.each(["0", "9007199254740993", "18446744073709551615"])("accepts exact u64 %s", value => {
    expect(jsonU64Schema.parse(value)).toBe(value)
  })
  it.each(["", "01", "+1", "-1", "1.0", "1e3", "18446744073709551616", 1])(
    "rejects noncanonical or overflowing u64 %s",
    value => {
      expect(jsonU64Schema.safeParse(value).success).toBe(false)
    }
  )
  it("rejects unknown event variants and fields", () => {
    expect(realtimeEventSchema.safeParse({ ...context, kind: "future-event" }).success).toBe(false)
    expect(
      realtimeEventSchema.safeParse({
        ...context,
        kind: "xrun",
        count: "1",
        deviceSample: "512",
        extra: true,
      }).success
    ).toBe(false)
    expect(
      realtimeEventSchema.parse({ ...context, kind: "xrun", count: "1", deviceSample: "512" })
    ).toMatchObject({ kind: "xrun", seq: "9007199254740993" })
  })
  it("requires a receipt for committed recording and error for failed recording", () => {
    expect(recordingStateSchema.safeParse({ state: "committed" }).success).toBe(false)
    expect(recordingStateSchema.safeParse({ state: "failed" }).success).toBe(false)
    expect(
      recordingStateSchema.parse({
        state: "failed",
        error: {
          code: "recording-overrun",
          message: "Pool exhausted",
          recoverable: true,
          partialSourceIds: ["partial"],
        },
      })
    ).toMatchObject({ state: "failed" })
  })
  it("rejects invalid connection identities and rates", () => {
    expect(
      realtimeEventSchema.safeParse({
        ...context,
        streamId: -1,
        kind: "xrun",
        count: "1",
        deviceSample: "512",
      }).success
    ).toBe(false)
    expect(
      realtimeEventSchema.safeParse({
        ...context,
        kind: "link-state",
        enabled: true,
        peers: 2,
        tempo: Number.NaN,
        startStopSync: false,
        mode: "link",
      }).success
    ).toBe(false)
  })
  it("requires nullable fields to be present explicitly", () => {
    const event = {
      ...context,
      kind: "session-slot-state",
      slotId: "slot",
      trackId: "track",
      status: "stopped",
    }
    expect(realtimeEventSchema.safeParse(event).success).toBe(false)
    expect(realtimeEventSchema.parse({ ...event, queuedSample: null })).toMatchObject({
      queuedSample: null,
    })
  })
})
