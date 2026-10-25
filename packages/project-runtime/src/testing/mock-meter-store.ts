import type { BackendTrack } from "@zoeydaw/project-core/backend"
import {
  FRAME_TYPES_LEVELS,
  HEADER_BYTES,
  HEADER_FLAGS_PLAYING,
  HEADER_FLAGS_RECORDING,
  MAGIC,
  RECORD_BYTES,
  RECORD_FLAGS_VALID,
  VERSION,
  writeHeader,
  writeRecord,
  type MeterRegistryEntry,
  type RealtimeRegistry,
} from "@zoeydaw/project-core/realtime"
import { createMeterStore } from "../realtime/meter-store"

const STREAM_ID = 1
const SAMPLE_RATE = 48000

export function createMockMeterStream() {
  const store = createMeterStore()
  let entries: readonly MeterRegistryEntry[] = []
  let revision = 0
  let sessionId = ""
  let sequence = 0n
  function updateSession(nextSession: string, tracks: readonly BackendTrack[]): void {
    const layout = tracks.flatMap((track, index): MeterRegistryEntry[] =>
      [0, 1].map(channel => ({
        slotId: index * 2 + channel,
        endpointId: track.id,
        ownerId: track.id,
        kind:
          track.kind === "main"
            ? "master"
            : track.kind === "group" || track.kind === "return"
              ? "bus"
              : "track-out",
        channelIndex: channel,
        channelCount: 2,
        capabilities: ["peak", "rms", "hold", "clip"],
      }))
    )
    if (
      sessionId === nextSession &&
      entries.length === layout.length &&
      entries.every(
        (entry, index) =>
          entry.endpointId === layout[index].endpointId && entry.kind === layout[index].kind
      )
    )
      return
    if (sessionId !== nextSession) {
      sessionId = nextSession
      revision = 0
      sequence = 0n
      store.bindStream(STREAM_ID, sessionId)
    }
    entries = layout
    revision += 1
    const registry: RealtimeRegistry = {
      sessionId,
      sessionEpoch: 1,
      deviceEpoch: 1,
      generation: 1,
      registryRevision: revision,
      resetEpoch: 0,
      entries,
      sources: [],
      endpointResets: tracks.map((track, index) => ({
        endpointId: track.id,
        slotIds: [index * 2, index * 2 + 1],
        slotResetEpoch: 0,
      })),
    }
    store.acceptRegistry(registry, STREAM_ID)
  }

  function publish(
    levels: Record<string, [number, number]>,
    now: number,
    bar: number,
    bpm: number,
    numerator: number,
    playing: boolean,
    recording: boolean,
    controlGeneration: string,
    acceptedRevision: number
  ): void {
    const slotCount = entries.length
    const bytes = new ArrayBuffer(HEADER_BYTES + slotCount * RECORD_BYTES)
    const view = new DataView(bytes)
    const timeSamples = BigInt(Math.max(0, Math.floor((now * SAMPLE_RATE) / 1000)))
    writeHeader(view, {
      magic: MAGIC,
      version: VERSION,
      headerBytes: HEADER_BYTES,
      generation: 1,
      registryRevision: revision,
      streamId: STREAM_ID,
      slotCount,
      seq: ++sequence,
      timeSamples,
      sampleRate: SAMPLE_RATE,
      producedMonotonicNs: BigInt(Math.max(0, Math.floor(now * 1_000_000))),
      controlGeneration: BigInt(controlGeneration),
      acceptedRevision: BigInt(acceptedRevision),
      audioRevision: BigInt(acceptedRevision),
      subscriptionRevision: 0,
      flags: (playing ? HEADER_FLAGS_PLAYING : 0) | (recording ? HEADER_FLAGS_RECORDING : 0),
      timelineSample: BigInt(
        Math.max(0, Math.floor((((bar - 1) * numerator * 60) / bpm) * SAMPLE_RATE))
      ),
      timelineBeat: (bar - 1) * numerator,
      tempoBpm: bpm,
      deviceEpoch: 1,
      sourceCount: 0,
      resetEpoch: 0,
      frameType: FRAME_TYPES_LEVELS,
    })
    for (const entry of entries) {
      const db = levels[entry.endpointId]?.[entry.channelIndex] ?? -60
      const peak = db <= -60 ? 0 : 10 ** (db / 20)
      writeRecord(
        view,
        {
          slotId: entry.slotId,
          flags: RECORD_FLAGS_VALID,
          blockEndSample: timeSamples,
          peak,
          rms: peak,
          hold: peak,
          sessionPeak: peak,
          clipCount: 0n,
          validFrames: 1,
          slotResetEpoch: 0,
        },
        HEADER_BYTES + entry.slotId * RECORD_BYTES
      )
    }
    store.acceptFrame(bytes)
  }

  return { store, updateSession, publish }
}
