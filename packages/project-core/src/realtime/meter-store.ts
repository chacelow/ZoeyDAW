import type { LevelsFrame } from "./levels"
import type { RealtimeRegistry, WireRecord, WireSource } from "./protocol.generated"

export interface MeterSnapshot {
  readonly registry: RealtimeRegistry
  readonly frame: LevelsFrame
  readonly records: ReadonlyMap<number, WireRecord>
  readonly sources: readonly WireSource[]
  readonly staleSlots: ReadonlySet<number>
  readonly stale: boolean
}

export interface MeterStore {
  bindStream(streamId: number, sessionId: string): void
  acceptRegistry(registry: RealtimeRegistry, streamId: number): void
  acceptFrame(bytes: ArrayBuffer): boolean
  markStale(): void
  readLatest(): MeterSnapshot | null
  readMetadata(): {
    readonly registry: RealtimeRegistry | null
    readonly streamId: number | null
    readonly needsRegistry: boolean
    readonly endpointIds: readonly string[]
  }
  setInterest(owner: string, endpointIds: readonly string[]): () => void
  subscribeMetadata(listener: () => void): () => void
  subscribeFrames(listener: () => void): () => void
  dispose(): void
}
