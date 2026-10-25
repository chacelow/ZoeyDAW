import {
  HEADER_BYTES,
  FRAME_TYPES_LEVELS,
  HEADER_FLAGS_PLAYING,
  HEADER_FLAGS_RECORDING,
  HEADER_FLAGS_SUBSCRIPTION_CHANGED,
  HEADER_FLAGS_REVISIONS_UNAVAILABLE,
  RECORD_FLAGS_VALID,
  RECORD_FLAGS_STALE,
  RECORD_FLAGS_CLIPPED,
  RECORD_FLAGS_UNAVAILABLE,
  RECORD_FLAGS_RMS_INITIALIZING,
  RECORD_FLAGS_RMS_STALE,
  SOURCE_FLAGS_VALID,
  SOURCE_FLAGS_STALE,
  SOURCE_FLAGS_UNAVAILABLE,
  MAGIC,
  RECORD_BYTES,
  SOURCE_BYTES,
  VERSION,
  readHeader,
  readRecord,
  readSource,
  type WireHeader,
  type WireRecord,
  type WireSource,
} from "./protocol.generated"
import { decodeTransport, type RealtimeTransport } from "./transport"
const headerMask =
  HEADER_FLAGS_PLAYING |
  HEADER_FLAGS_RECORDING |
  HEADER_FLAGS_SUBSCRIPTION_CHANGED |
  HEADER_FLAGS_REVISIONS_UNAVAILABLE
const rmsUnavailableMask = RECORD_FLAGS_RMS_INITIALIZING | RECORD_FLAGS_RMS_STALE
const recordMask =
  RECORD_FLAGS_VALID |
  RECORD_FLAGS_STALE |
  RECORD_FLAGS_CLIPPED |
  RECORD_FLAGS_UNAVAILABLE |
  rmsUnavailableMask
const sourceMask = SOURCE_FLAGS_VALID | SOURCE_FLAGS_STALE | SOURCE_FLAGS_UNAVAILABLE

export interface LevelsFrame {
  readonly header: WireHeader
  readonly records: readonly WireRecord[]
  readonly transport: RealtimeTransport
  readonly sources: readonly WireSource[]
  readonly bytes: ArrayBuffer
}

export function decodeLevelsFrame(bytes: ArrayBuffer): LevelsFrame | null {
  if (bytes.byteLength < HEADER_BYTES) return null
  const view = new DataView(bytes)
  const header = readHeader(view)
  if (
    header.magic !== MAGIC ||
    header.version !== VERSION ||
    header.headerBytes !== HEADER_BYTES ||
    header.frameType !== FRAME_TYPES_LEVELS ||
    (header.flags & ~headerMask) !== 0 ||
    bytes.byteLength !==
      HEADER_BYTES + RECORD_BYTES * header.slotCount + SOURCE_BYTES * header.sourceCount
  )
    return null
  const transport = decodeTransport(header)
  if (!transport) return null
  const records: WireRecord[] = []
  const slots = new Set<number>()
  let offset = HEADER_BYTES
  for (let index = 0; index < header.slotCount; index += 1) {
    const record = readRecord(view, offset)
    if (
      slots.has(record.slotId) ||
      (record.flags & ~recordMask) !== 0 ||
      ![record.peak, record.rms, record.hold, record.sessionPeak].every(
        value => Number.isFinite(value) && value >= 0
      ) ||
      ((record.flags & rmsUnavailableMask) !== 0 && record.rms !== 0)
    )
      return null
    slots.add(record.slotId)
    records.push(record)
    offset += RECORD_BYTES
  }
  const sources: WireSource[] = []
  for (let index = 0; index < header.sourceCount; index += 1) {
    const source = readSource(view, offset)
    if (
      (source.flags & ~sourceMask) !== 0 ||
      source.reserved !== 0 ||
      !Number.isFinite(source.sourceFrame) ||
      !Number.isFinite(source.sourceRate) ||
      source.sourceRate <= 0
    )
      return null
    sources.push(source)
    offset += SOURCE_BYTES
  }
  return { header, transport, records, sources, bytes }
}
