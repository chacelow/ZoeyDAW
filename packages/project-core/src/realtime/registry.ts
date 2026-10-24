import { realtimeRegistrySchema } from "./protocol.generated"

export const meterRegistrySchema = realtimeRegistrySchema.superRefine((registry, context) => {
  const reject = (message: string) => context.addIssue({ code: "custom", message })
  const slots = new Set<number>()
  const endpoints = new Map<
    string,
    { count: number; owner: string; kind: string; channels: Set<number>; slots: Set<number> }
  >()
  for (const entry of registry.entries) {
    if (slots.has(entry.slotId)) reject(`Duplicate slot ${entry.slotId}`)
    slots.add(entry.slotId)
    if (entry.channelCount === 0 || entry.channelIndex >= entry.channelCount)
      reject(`Invalid channel for ${entry.endpointId}`)
    if (new Set(entry.capabilities).size !== entry.capabilities.length)
      reject(`Duplicate capability for ${entry.endpointId}`)
    const endpoint = endpoints.get(entry.endpointId)
    if (endpoint) {
      if (
        endpoint.count !== entry.channelCount ||
        endpoint.owner !== entry.ownerId ||
        endpoint.kind !== entry.kind ||
        endpoint.channels.has(entry.channelIndex)
      )
        reject(`Inconsistent endpoint ${entry.endpointId}`)
      endpoint.channels.add(entry.channelIndex)
      endpoint.slots.add(entry.slotId)
    } else {
      endpoints.set(entry.endpointId, {
        count: entry.channelCount,
        owner: entry.ownerId,
        kind: entry.kind,
        channels: new Set([entry.channelIndex]),
        slots: new Set([entry.slotId]),
      })
    }
  }
  for (const [id, endpoint] of endpoints) {
    if (endpoint.channels.size !== endpoint.count) reject(`Incomplete channel layout for ${id}`)
  }
  const resets = new Set<string>()
  for (const baseline of registry.endpointResets) {
    const endpoint = endpoints.get(baseline.endpointId)
    if (
      !endpoint ||
      resets.has(baseline.endpointId) ||
      baseline.slotResetEpoch > registry.resetEpoch
    ) {
      reject(`Invalid reset baseline for ${baseline.endpointId}`)
      continue
    }
    resets.add(baseline.endpointId)
    if (
      new Set(baseline.slotIds).size !== baseline.slotIds.length ||
      baseline.slotIds.length !== endpoint.slots.size ||
      baseline.slotIds.some(slot => !endpoint.slots.has(slot))
    )
      reject(`Reset slots mismatch for ${baseline.endpointId}`)
  }
  if (resets.size !== endpoints.size) reject("Missing endpoint reset baseline")
  const clips = new Set<number>()
  const clipIds = new Set<string>()
  const sources = new Map<number, { id: string; generation: number; rate: number }>()
  const sourceIds = new Map<string, number>()
  for (const source of registry.sources) {
    if (clips.has(source.clipHandle) || clipIds.has(source.clipId))
      reject(`Duplicate clip mapping ${source.clipId}`)
    clips.add(source.clipHandle)
    clipIds.add(source.clipId)
    const prior = sources.get(source.sourceHandle)
    if (
      prior &&
      (prior.id !== source.sourceId ||
        prior.generation !== source.sourceGeneration ||
        prior.rate !== source.sourceRate)
    )
      reject(`Inconsistent source handle ${source.sourceHandle}`)
    const priorHandle = sourceIds.get(source.sourceId)
    if (priorHandle !== undefined && priorHandle !== source.sourceHandle)
      reject(`Duplicate source identity ${source.sourceId}`)
    sources.set(source.sourceHandle, {
      id: source.sourceId,
      generation: source.sourceGeneration,
      rate: source.sourceRate,
    })
    sourceIds.set(source.sourceId, source.sourceHandle)
  }
})
