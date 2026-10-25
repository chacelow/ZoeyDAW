import {
  decodeLevelsFrame,
  meterRegistrySchema,
  SOURCE_FLAGS_UNAVAILABLE,
  HEADER_FLAGS_SUBSCRIPTION_CHANGED,
  type RealtimeRegistry,
  type WireRecord,
  type MeterStore,
  type MeterSnapshot,
} from "@zoeydaw/project-core/realtime"

export function createMeterStore(): MeterStore {
  let disposed = false
  let streamId: number | null = null
  let sessionId = ""
  let registry: RealtimeRegistry | null = null
  let latest: MeterSnapshot | null = null
  let sequence = -1n
  let needsRegistry = false
  let entries = new Map<number, RealtimeRegistry["entries"][number]>()
  let resets = new Map<number, number>()
  let sourceMappings = new Map<number, RealtimeRegistry["sources"][number]>()
  const interests = new Map<string, { token: object; ids: readonly string[]; transport: boolean }>()
  const listeners = new Set<() => void>()
  const frameListeners = new Set<() => void>()
  let endpointIds: readonly string[] = []
  let transportInterest = false
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const notifyFrames = () => {
    const errors: unknown[] = []
    for (const listener of frameListeners) {
      try {
        listener()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new AggregateError(errors, "Meter frame notification failed")
  }
  const requireRegistry = () => {
    if (latest && !latest.stale) latest = { ...latest, stale: true }
    if (!needsRegistry) {
      needsRegistry = true
      notify()
    }
    return false
  }
  const updateInterest = () => {
    const transport = [...interests.values()].some(value => value.transport)
    const next = [...new Set([...interests.values()].flatMap(value => value.ids))].sort((a, b) =>
      a.localeCompare(b)
    )
    if (
      transport === transportInterest &&
      next.length === endpointIds.length &&
      next.every((id, index) => id === endpointIds[index])
    )
      return
    endpointIds = next
    transportInterest = transport
    notify()
  }
  return {
    bindStream(next, session) {
      if (disposed) return
      if (!Number.isInteger(next) || next < 1 || next > 0xffff_ffff || !session)
        throw new Error("Invalid meter stream identity")
      if (next === streamId && session === sessionId) return
      sessionId = session
      streamId = next
      registry = null
      latest = null
      sequence = -1n
      entries.clear()
      resets.clear()
      sourceMappings.clear()
      needsRegistry = true
      notify()
    },
    acceptRegistry(input, expectedStream) {
      if (disposed || streamId === null || expectedStream !== streamId) return
      const next = meterRegistrySchema.parse(input)
      if (next.sessionId !== sessionId) return
      if (registry) {
        if (next.sessionId !== registry.sessionId || next.sessionEpoch !== registry.sessionEpoch)
          return
        if (
          next.deviceEpoch < registry.deviceEpoch ||
          next.generation < registry.generation ||
          next.registryRevision < registry.registryRevision ||
          next.resetEpoch < registry.resetEpoch
        )
          return
        const changedIdentity =
          next.deviceEpoch !== registry.deviceEpoch ||
          next.generation !== registry.generation ||
          next.registryRevision !== registry.registryRevision
        if (!changedIdentity) {
          const priorEntries = [...registry.entries].sort((a, b) => a.slotId - b.slotId)
          const nextEntries = [...next.entries].sort((a, b) => a.slotId - b.slotId)
          const priorSources = [...registry.sources].sort((a, b) => a.clipHandle - b.clipHandle)
          const nextSources = [...next.sources].sort((a, b) => a.clipHandle - b.clipHandle)
          if (
            JSON.stringify(priorEntries) !== JSON.stringify(nextEntries) ||
            JSON.stringify(priorSources) !== JSON.stringify(nextSources)
          )
            throw new Error("Meter mappings changed without a registry revision")
          for (const baseline of next.endpointResets)
            for (const slot of baseline.slotIds)
              if (baseline.slotResetEpoch < (resets.get(slot) ?? 0)) return
        } else {
          latest = null
        }
      }
      entries = new Map(next.entries.map(entry => [entry.slotId, entry]))
      resets = new Map(
        next.endpointResets.flatMap(baseline =>
          baseline.slotIds.map(slot => [slot, baseline.slotResetEpoch])
        )
      )
      sourceMappings = new Map(next.sources.map(source => [source.clipHandle, source]))
      registry = next
      needsRegistry = false
      if (latest) {
        const records = new Map(latest.records)
        const staleSlots = new Set(latest.staleSlots)
        for (const [slot, record] of records)
          if (record.slotResetEpoch !== resets.get(slot)) {
            records.delete(slot)
            staleSlots.add(slot)
          }
        latest = { ...latest, registry: next, records, staleSlots }
      }
      notify()
    },
    acceptFrame(bytes) {
      if (disposed || streamId === null) return false
      const frame = decodeLevelsFrame(bytes)
      if (!frame || frame.header.streamId !== streamId || frame.header.seq < sequence) return false
      const priorSubscription = latest?.frame.header.subscriptionRevision ?? -1
      if (frame.header.subscriptionRevision < priorSubscription) return false
      if (
        frame.header.seq === sequence &&
        (frame.header.subscriptionRevision <= priorSubscription ||
          // eslint-disable-next-line sonarjs/bitwise-operators -- The wire flag is a bit mask.
          (frame.header.flags & HEADER_FLAGS_SUBSCRIPTION_CHANGED) === 0)
      )
        return false
      if (!registry) return requireRegistry()
      const header = frame.header
      if (
        header.deviceEpoch !== registry.deviceEpoch ||
        header.generation !== registry.generation ||
        header.registryRevision !== registry.registryRevision
      ) {
        if (
          header.deviceEpoch < registry.deviceEpoch ||
          header.generation < registry.generation ||
          header.registryRevision < registry.registryRevision
        )
          return false
        return requireRegistry()
      }
      if (header.resetEpoch > registry.resetEpoch) return requireRegistry()
      if (frame.records.some(record => !entries.has(record.slotId))) return requireRegistry()
      if (frame.records.some(record => record.slotResetEpoch > (resets.get(record.slotId) ?? 0)))
        return requireRegistry()
      const records = new Map<number, WireRecord>()
      const staleSlots = new Set<number>()
      for (const record of frame.records) {
        if (record.slotResetEpoch !== resets.get(record.slotId)) staleSlots.add(record.slotId)
        else records.set(record.slotId, record)
      }
      const sources = frame.sources.map(source => {
        const mapping = sourceMappings.get(source.clipHandle)
        if (
          mapping &&
          source.sourceHandle === mapping.sourceHandle &&
          source.sourceGeneration === mapping.sourceGeneration &&
          source.sourceRate === mapping.sourceRate
        )
          return source
        return { ...source, flags: SOURCE_FLAGS_UNAVAILABLE }
      })
      sequence = header.seq
      latest = { registry, frame, records, sources, staleSlots, stale: false }
      notifyFrames()
      return true
    },
    markStale() {
      if (latest && !latest.stale) {
        latest = { ...latest, stale: true }
        notifyFrames()
      }
    },
    readLatest: () => latest,
    readMetadata: () => ({
      registry,
      streamId,
      needsRegistry,
      endpointIds,
      transport: transportInterest,
    }),
    setInterest(owner, interest) {
      if (disposed) return () => {}
      const token = {}
      interests.set(owner, {
        token,
        ids: [...new Set(interest.endpointIds)],
        transport: interest.transport,
      })
      updateInterest()
      return () => {
        if (interests.get(owner)?.token !== token) return
        interests.delete(owner)
        updateInterest()
      }
    },
    subscribeMetadata(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeFrames(listener) {
      if (disposed) return () => {}
      frameListeners.add(listener)
      return () => {
        frameListeners.delete(listener)
      }
    },
    dispose() {
      disposed = true
      listeners.clear()
      frameListeners.clear()
      interests.clear()
      endpointIds = []
      transportInterest = false
      streamId = null
      sessionId = ""
      registry = null
      latest = null
      entries.clear()
      resets.clear()
      sourceMappings.clear()
    },
  }
}
