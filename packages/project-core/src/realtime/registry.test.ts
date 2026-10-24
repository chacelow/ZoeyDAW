import { describe, expect, it } from "vitest"
import { meterRegistrySchema } from "./registry"

function registry() {
  return {
    sessionId: "session",
    sessionEpoch: 1,
    deviceEpoch: 1,
    generation: 2,
    registryRevision: 3,
    resetEpoch: 4,
    entries: [0, 1].map(channelIndex => ({
      slotId: channelIndex,
      endpointId: "track/audio/out",
      kind: "track-out",
      ownerId: "audio",
      channelIndex,
      channelCount: 2,
      capabilities: ["peak", "rms"],
    })),
    sources: [1, 2].map(clipHandle => ({
      clipHandle,
      clipId: `clip-${clipHandle}`,
      sourceHandle: 9,
      sourceId: "source",
      sourceGeneration: 1,
      sourceRate: 44100,
      owner: "arrangement",
    })),
    endpointResets: [{ endpointId: "track/audio/out", slotIds: [0, 1], slotResetEpoch: 2 }],
  }
}
describe("meter registry identity", () => {
  it("accepts shared source and older per-endpoint reset epoch", () => {
    expect(meterRegistrySchema.parse(registry()).endpointResets[0]?.slotResetEpoch).toBe(2)
  })
  it("rejects slot aliases and incomplete channel layouts", () => {
    const value = registry()
    const first = value.entries[0]
    if (!first) throw new Error("Missing fixture channel")
    value.entries.push(first)
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
    value.entries = [first]
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
  })
  it("rejects missing, future and misdirected reset baselines", () => {
    const value = registry()
    value.endpointResets = []
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
    value.endpointResets = [{ endpointId: "track/audio/out", slotIds: [0, 1], slotResetEpoch: 5 }]
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
    value.endpointResets = [{ endpointId: "track/audio/out", slotIds: [0, 2], slotResetEpoch: 2 }]
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
  })
  it("rejects source handle reuse with a different source generation", () => {
    const value = registry()
    const second = value.sources[1]
    if (!second) throw new Error("Missing fixture clip")
    second.sourceGeneration = 2
    expect(meterRegistrySchema.safeParse(value).success).toBe(false)
  })
})
