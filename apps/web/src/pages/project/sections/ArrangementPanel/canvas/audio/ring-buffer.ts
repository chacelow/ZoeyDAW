/** Latest-value telemetry for the single-threaded Web prototype, not a native Rust transport. */
const HEADER_BYTES = 24
const METER_BYTES = 8

export interface PlayheadFrame {
  bar: number
  playing: boolean
  recording: boolean
  revision: number
}

export interface MeterFrame {
  left: number
  right: number
}

export interface AudioRingBuffer {
  readPlayhead(): PlayheadFrame
  readMeter(trackId: string): MeterFrame
  writePlayhead(frame: Omit<PlayheadFrame, "revision">): void
  writeMeter(trackId: string, meter: MeterFrame): void
  allocateMeter(trackId: string): number
  freeMeter(trackId: string): void
  readRevision(): number
  dispose(): void
}

interface Options {
  maxTracks?: number
}

export function createAudioRingBuffer({ maxTracks }: Options = {}): AudioRingBuffer {
  let capacity = maxTracks ?? 128
  const allocate = (tracks: number) => {
    const bytes = HEADER_BYTES + tracks * METER_BYTES
    return typeof SharedArrayBuffer === "function"
      ? new SharedArrayBuffer(bytes)
      : new ArrayBuffer(bytes)
  }
  let buffer = allocate(capacity)
  let cursor = new Uint32Array(buffer, 0, 1)
  let headerBar = new Float64Array(buffer, 8, 1)
  let headerFlags = new Uint32Array(buffer, 16, 1)
  let meterFloats = new Float32Array(buffer, HEADER_BYTES, capacity * 2)
  headerBar[0] = 1
  meterFloats.fill(-Infinity)
  const slots = new Map<string, number>()
  const freed: number[] = []
  let nextSlot = 0

  function grow() {
    if (maxTracks !== undefined) throw new Error(`Ring buffer exhausted at ${maxTracks} tracks`)
    capacity *= 2
    const next = allocate(capacity)
    new Uint8Array(next).set(new Uint8Array(buffer))
    buffer = next
    cursor = new Uint32Array(buffer, 0, 1)
    headerBar = new Float64Array(buffer, 8, 1)
    headerFlags = new Uint32Array(buffer, 16, 1)
    const previousLength = meterFloats.length
    meterFloats = new Float32Array(buffer, HEADER_BYTES, capacity * 2)
    meterFloats.fill(-Infinity, previousLength)
  }

  function bump(): number {
    const current = atomicLoad(cursor) + 1
    atomicStore(cursor, current)
    return current
  }

  function assignSlot(trackId: string): number {
    const existing = slots.get(trackId)
    if (existing !== undefined) return existing
    const slot = freed.pop() ?? nextSlot++
    if (slot >= capacity) grow()
    slots.set(trackId, slot)
    meterFloats[slot * 2] = -Infinity
    meterFloats[slot * 2 + 1] = -Infinity
    return slot
  }

  return {
    readRevision: () => atomicLoad(cursor),
    readPlayhead() {
      return {
        bar: headerBar[0],
        playing: (headerFlags[0] & 1) === 1,
        recording: (headerFlags[0] & 2) === 2,
        revision: atomicLoad(cursor),
      }
    },
    readMeter(trackId) {
      const slot = slots.get(trackId)
      if (slot === undefined) return { left: -Infinity, right: -Infinity }
      const base = slot * 2
      return { left: meterFloats[base], right: meterFloats[base + 1] }
    },
    writePlayhead(frame) {
      const flags = (frame.playing ? 1 : 0) | (frame.recording ? 2 : 0)
      if (headerBar[0] === frame.bar && headerFlags[0] === flags) return
      headerBar[0] = frame.bar
      headerFlags[0] = flags
      bump()
    },
    writeMeter(trackId, meter) {
      const slot = assignSlot(trackId)
      const base = slot * 2
      const left = Math.fround(meter.left)
      const right = Math.fround(meter.right)
      if (meterFloats[base] === left && meterFloats[base + 1] === right) return
      meterFloats[base] = left
      meterFloats[base + 1] = right
      bump()
    },
    allocateMeter(trackId) {
      return assignSlot(trackId)
    },
    freeMeter(trackId) {
      const slot = slots.get(trackId)
      if (slot === undefined) return
      slots.delete(trackId)
      freed.push(slot)
      meterFloats[slot * 2] = -Infinity
      meterFloats[slot * 2 + 1] = -Infinity
      bump()
    },
    dispose() {
      slots.clear()
      nextSlot = 0
      freed.length = 0
      meterFloats.fill(-Infinity)
      headerBar[0] = 1
      headerFlags[0] = 0
      atomicStore(cursor, 0)
    },
  }
}
function isShared(buffer: ArrayBufferLike): boolean {
  return typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer
}

function atomicLoad(view: Uint32Array): number {
  if (typeof Atomics !== "undefined" && isShared(view.buffer)) {
    return Atomics.load(view, 0)
  }
  return view[0]
}

function atomicStore(view: Uint32Array, value: number): void {
  if (typeof Atomics !== "undefined" && isShared(view.buffer)) {
    Atomics.store(view, 0, value)
    return
  }
  view[0] = value
}

export const arrangementRingBuffer = createAudioRingBuffer()
