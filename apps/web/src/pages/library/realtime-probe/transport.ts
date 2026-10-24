import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import { z } from "zod"
import type { ClockMapping, ClockProbe, NativeClose, ProbeMode } from "./model"

const openSchema = z.object({ id: z.string().min(1), bytes: z.number().int().min(32).max(262144) })
const closeSchema = z.object({
  published: z.number().int().nonnegative().max(1200),
  sent: z.number().int().nonnegative().max(1200),
  retainedBytes: z.number().int().nonnegative().max(262144),
})
const clockSchema = z.object({ monotonicNs: z.string().regex(/^\d+$/) })
const U64_MAX = (1n << 64n) - 1n

export type ProbeFrame = {
  readonly seq: bigint
  readonly producedNs: bigint
  readonly producedMs: number
  readonly sampledPayload: string
}

export function nativeNsToMs(nanoseconds: bigint): number {
  if (nanoseconds < 0n || nanoseconds > U64_MAX) throw new Error("Invalid native monotonic u64")
  return Number(nanoseconds / 1000000n) + Number(nanoseconds % 1000000n) / 1000000
}

export function parseFrame(bytes: ArrayBuffer, expectedBytes: number): ProbeFrame {
  if (bytes.byteLength !== expectedBytes || bytes.byteLength < 32) {
    throw new Error(`Probe byte length ${bytes.byteLength}; expected ${expectedBytes}`)
  }
  const header = new DataView(bytes)
  if (
    header.getUint32(0, true) !== 0x5052445a ||
    header.getUint32(4, true) !== 1 ||
    header.getUint32(24, true) !== expectedBytes ||
    header.getUint32(28, true) !== 0
  ) {
    throw new Error("Invalid probe magic/version/payloadBytes/reserved header")
  }
  const seq = header.getBigUint64(8, true)
  if (seq === 0n) throw new Error("Invalid zero probe sequence")
  const producedNs = header.getBigUint64(16, true)
  const payload = new Uint8Array(bytes)
  const offsets = [32, 33, Math.floor(expectedBytes / 2), expectedBytes - 1]
  const samples: number[] = []
  for (const offset of offsets) {
    if (offset < 32 || offset >= expectedBytes) continue
    const sample = payload[offset]
    if (sample !== ((offset + Number(seq & 255n)) & 255)) {
      throw new Error(`Probe deterministic payload mismatch at byte ${offset}`)
    }
    samples.push(sample)
  }
  return {
    seq,
    producedNs,
    producedMs: nativeNsToMs(producedNs),
    sampledPayload: samples.join(":"),
  }
}

export function openProbe(options: {
  readonly bytes: number
  readonly mode: ProbeMode
  readonly channel: Channel<ArrayBuffer>
}) {
  if (!import.meta.env.DEV || !isTauri()) {
    throw new Error("Realtime probe requires the development Tauri window")
  }
  return invoke<unknown>("realtime_probe_open", options).then(value => openSchema.parse(value))
}

export async function closeProbe(id: string): Promise<NativeClose> {
  return closeSchema.parse(await invoke<unknown>("realtime_probe_close", { id }))
}

export async function pullProbe(id: string, afterSeq: string): Promise<ArrayBuffer> {
  const value: unknown = await invoke("realtime_probe_pull", { id, afterSeq })
  if (!(value instanceof ArrayBuffer)) throw new Error("Probe pull did not return raw ArrayBuffer")
  return value
}

export async function receiptProbe(id: string, throughSeq: string): Promise<void> {
  await invoke("realtime_probe_receipt", { id, throughSeq })
}

export function boundedAwait<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function cleanup() {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    }
    function onAbort() {
      cleanup()
      reject(new DOMException("Probe cancelled", "AbortError"))
    }
    timer = setTimeout(() => {
      cleanup()
      reject(
        new Error(
          `Probe command did not settle within ${timeoutMs}ms; native work is not cancelled`
        )
      )
    }, timeoutMs)
    signal.addEventListener("abort", onAbort, { once: true })
    promise
      .then(value => {
        cleanup()
        resolve(value)
      })
      .catch((error: unknown) => {
        cleanup()
        reject(error)
      })
    if (signal.aborted) onAbort()
  })
}

export async function measureClock(signal: AbortSignal): Promise<ClockMapping> {
  const probes: ClockProbe[] = []
  for (let index = 0; index < 5; index += 1) {
    if (signal.aborted) throw new DOMException("Probe cancelled", "AbortError")
    const sentMs = performance.now()
    // eslint-disable-next-line no-await-in-loop -- Five non-overlapping RTT samples are required for the min-RTT clock estimate.
    const value = await boundedAwait(invoke<unknown>("realtime_probe_clock"), signal, 2500)
    const receivedMs = performance.now()
    const nativeNs = clockSchema.parse(value).monotonicNs
    const nativeMs = nativeNsToMs(BigInt(nativeNs))
    probes.push({
      sentMs,
      receivedMs,
      nativeNs,
      roundTripMs: receivedMs - sentMs,
      offsetMs: (sentMs + receivedMs) / 2 - nativeMs,
    })
  }
  let best = probes[0]
  for (const probe of probes) {
    if (!best || probe.roundTripMs < best.roundTripMs) best = probe
  }
  if (!best) throw new Error("No native clock probe completed")
  return { probes, offsetMs: best.offsetMs, uncertaintyMs: best.roundTripMs / 2 }
}

export { Channel, isTauri }
