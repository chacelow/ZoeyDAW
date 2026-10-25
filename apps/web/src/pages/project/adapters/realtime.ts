import type { MeterSession } from "@zoeydaw/project-runtime/realtime"
import {
  RECORD_FLAGS_VALID,
  RECORD_FLAGS_STALE,
  RECORD_FLAGS_UNAVAILABLE,
  readSourcePosition,
  type SourceReference,
  type SourcePosition,
  type MeterRegistryEntry,
  type RealtimeRegistry,
  type MeterStore,
} from "@zoeydaw/project-core/realtime"

const current: { session: MeterSession | null; registry: RealtimeRegistry | null } = {
  session: null,
  registry: null,
}
const selectionCache = new Map<string, readonly (MeterRegistryEntry | undefined)[]>()
const listeners = new Set<() => void>()
const backendReader: { read: () => MeterStore | null; store: MeterStore | null } = {
  read: () => null,
  store: null,
}

export function configureBackendMeterReader(read: () => MeterStore | null) {
  backendReader.read = read
}

export function synchronizeBackendMeters() {
  const store = backendReader.read()
  if (store === backendReader.store) return
  backendReader.store = store
  for (const listener of listeners) listener()
}

export function readProjectMeterStore() {
  return current.session?.store ?? backendReader.read()
}

export type ProjectMeterSource =
  | { readonly kind: "track"; readonly trackId: string }
  | { readonly kind: "input"; readonly channel: string }
  | { readonly kind: "device"; readonly deviceId: string; readonly side: "in" | "out" }
  | { readonly kind: "silent" }

function selectedEntries(source: ProjectMeterSource) {
  const registry = readProjectMeterStore()?.readMetadata().registry ?? null
  if (registry !== current.registry) {
    current.registry = registry
    selectionCache.clear()
  }
  const key =
    source.kind === "track"
      ? `track:${source.trackId}`
      : source.kind === "input"
        ? `input:${source.channel}`
        : source.kind === "device"
          ? `device:${source.deviceId}:${source.side}`
          : "silent"
  const cached = selectionCache.get(key)
  if (cached) return cached
  const entries = registry?.entries ?? []
  let selected: readonly (MeterRegistryEntry | undefined)[] = []
  if (source.kind === "track") {
    selected = entries
      .filter(
        entry =>
          entry.ownerId === source.trackId && ["track-out", "bus", "master"].includes(entry.kind)
      )
      .sort((left, right) => left.channelIndex - right.channelIndex)
  } else if (source.kind === "device") {
    selected = entries
      .filter(
        entry =>
          entry.ownerId === source.deviceId &&
          entry.kind === (source.side === "in" ? "device-in" : "device-out")
      )
      .sort((left, right) => left.channelIndex - right.channelIndex)
  } else if (source.kind === "input" && /^[1-9]\d*(?:-[1-9]\d*)?$/.test(source.channel)) {
    selected = source.channel
      .split("-")
      .map(value =>
        entries.find(
          entry => entry.kind === "input" && entry.endpointId.endsWith(`/${Number(value) - 1}`)
        )
      )
  }
  selectionCache.set(key, selected)
  return selected
}

export function readProjectMeterLevels(source: ProjectMeterSource): readonly [number, number] {
  const snapshot = readProjectMeterStore()?.readLatest()
  if (!snapshot || snapshot.stale) return [-Infinity, -Infinity]
  const entries = selectedEntries(source)
  const value = (index: number) => {
    const entry = entries[index]
    if (!entry || snapshot.staleSlots.has(entry.slotId)) return -Infinity
    const record = snapshot.records.get(entry.slotId)
    if (
      !record ||
      (record.flags & RECORD_FLAGS_VALID) === 0 ||
      (record.flags & (RECORD_FLAGS_STALE | RECORD_FLAGS_UNAVAILABLE)) !== 0
    )
      return -Infinity
    return record.peak > 0 ? 20 * Math.log10(record.peak) : -Infinity
  }
  return [value(0), value(entries.length > 1 ? 1 : 0)]
}

export function watchProjectMeter(owner: string, source: ProjectMeterSource, listener: () => void) {
  let detachMetadata = () => {}
  let detachInterest = () => {}
  let detachStatus = () => {}
  let detachStoreFrames = () => {}
  let interestKey: string | null = null
  const update = () => {
    const ids = selectedEntries(source).flatMap(entry => (entry ? [entry.endpointId] : []))
    const key = JSON.stringify(ids)
    if (key === interestKey) {
      listener()
      return
    }
    interestKey = key
    detachInterest()
    detachInterest = setProjectMeterInterest(owner, ids)
    listener()
  }
  const bind = () => {
    detachMetadata()
    detachStatus()
    detachStoreFrames()
    interestKey = null
    const store = readProjectMeterStore()
    detachMetadata = store?.subscribeMetadata(update) ?? (() => {})
    detachStoreFrames = store?.subscribeFrames(listener) ?? (() => {})
    detachStatus = current.session?.subscribeStatus(listener) ?? (() => {})
    update()
  }
  const detachSession = subscribeProjectMeters(bind)
  bind()
  return () => {
    detachSession()
    detachMetadata()
    detachStatus()
    detachStoreFrames()
    detachInterest()
  }
}

const interests = new Map<string, { ids: readonly string[]; detach: () => void }>()

export function readProjectMeters() {
  return current.session
}

export function subscribeProjectMeters(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishProjectMeters(next: MeterSession | null) {
  if (current.session === next) return
  current.session = next
  for (const [owner, interest] of interests) {
    interest.detach()
    interest.detach =
      next?.store.setInterest(owner, { endpointIds: interest.ids, transport: false }) ?? (() => {})
  }
  for (const listener of listeners) listener()
}

export function setProjectMeterInterest(owner: string, ids: readonly string[]) {
  interests.get(owner)?.detach()
  const interest = {
    ids,
    detach:
      readProjectMeterStore()?.setInterest(owner, { endpointIds: ids, transport: false }) ??
      (() => {}),
  }
  interests.set(owner, interest)
  return () => {
    if (interests.get(owner) !== interest) return
    interest.detach()
    interests.delete(owner)
  }
}

export function readProjectSource(reference: SourceReference): SourcePosition | null {
  return readSourcePosition(readProjectMeterStore()?.readLatest() ?? null, reference)
}

export function watchProjectSources(owner: string, listener: () => void): () => void {
  let detachMetadata = () => {}
  let detachFrames = () => {}
  let detachInterest = () => {}
  const bind = () => {
    detachFrames()
    detachMetadata()
    detachInterest()
    const store = readProjectMeterStore()
    detachMetadata = store?.subscribeMetadata(listener) ?? (() => {})
    detachFrames = store?.subscribeFrames(listener) ?? (() => {})
    detachInterest = store?.setInterest(owner, { endpointIds: [], transport: true }) ?? (() => {})
    listener()
  }
  const detachSession = subscribeProjectMeters(bind)
  bind()
  return () => {
    detachSession()
    detachFrames()
    detachMetadata()
    detachInterest()
  }
}
