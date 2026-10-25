import type { BackendTelemetry } from "@zoeydaw/project-core/backend"
import type { MeterSnapshot, RealtimeTransport } from "@zoeydaw/project-core/realtime"
import {
  createMeterSession,
  type MeterSession,
  type MeterSessionPort,
} from "@zoeydaw/project-runtime/realtime"
import { publishProjectMeters, readProjectMeters } from "../realtime"

export interface NativeTransport {
  readonly session: MeterSession
  setActive(active: boolean): void
  dispose(): Promise<void>
}

function sameObservation(previous: RealtimeTransport | null, next: RealtimeTransport): boolean {
  if (
    !previous ||
    previous.kind !== next.kind ||
    next.kind === "unavailable" ||
    previous.kind === "unavailable"
  )
    return false
  if (next.kind === "audio" && previous.kind === "audio")
    return next.observedMonotonicNs === previous.observedMonotonicNs
  return (
    next.kind === "stopped" &&
    previous.kind === "stopped" &&
    next.control.ownerEpoch === previous.control.ownerEpoch &&
    next.control.controlGeneration === previous.control.controlGeneration &&
    next.control.appliedSequence === previous.control.appliedSequence &&
    next.position.bar === previous.position.bar &&
    next.position.barsPerSecond === previous.position.barsPerSecond
  )
}
function safeCounter(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Native transport counter exceeds the backend counter range")
  return Number(value)
}
function telemetry(
  snapshot: MeterSnapshot,
  sessionId: string,
  sequence: number
): BackendTelemetry | null {
  if (snapshot.stale) return null
  const transport = snapshot.frame.transport
  if (transport.kind === "unavailable" || !transport.control) return null
  const control = transport.control
  const common = {
    sessionId,
    sequence,
    appliedSequence: safeCounter(control.appliedSequence),
    controlGeneration: control.controlGeneration.toString(),
  }
  if (transport.kind === "stopped")
    return {
      ...common,
      clock: { kind: "musical", ...transport.position },
      playing: false,
      recording: false,
    }
  if (snapshot.frame.header.producedMonotonicNs - transport.observedMonotonicNs > 250_000_000n)
    return null
  const position = transport.playing ? transport.audible : transport.rendered
  if (!position) return null
  return {
    ...common,
    clock: {
      kind: "sample",
      ...position,
      frame: safeCounter(transport.clock.timeSamples),
      sampleRate: transport.clock.sampleRate,
    },
    playing: transport.playing,
    recording: transport.recording,
  }
}

export function createNativeTransport(options: {
  port: MeterSessionPort
  leaseId: string
  sessionId: string
  active: boolean
  onFrame: (frame: BackendTelemetry) => void
  onError: (error: unknown) => void
}): NativeTransport {
  let active = options.active
  let disposed = false
  let sequence = 0
  let previous: RealtimeTransport | null = null
  const session = createMeterSession({
    port: options.port,
    leaseId: options.leaseId,
    sessionId: options.sessionId,
    now: () => performance.now(),
    onError: options.onError,
    onEvent: event => {
      if (event.kind === "plugin-fault") options.onError(new Error(event.message))
    },
  })
  let detachInterest = session.store.setInterest("native-transport", {
    endpointIds: [],
    transport: active,
  })
  const detachFrames = session.store.subscribeFrames(() => {
    if (!active || disposed) return
    const snapshot = session.store.readLatest()
    if (!snapshot || sameObservation(previous, snapshot.frame.transport)) return
    const frame = telemetry(snapshot, options.sessionId, sequence + 1)
    if (!frame) return
    if (!Number.isSafeInteger(frame.sequence))
      throw new Error("Native transport receipt sequence exhausted")
    sequence = frame.sequence
    previous = snapshot.frame.transport
    options.onFrame(frame)
  })
  const visibility = () => session.setVisible(!document.hidden)
  visibility()
  document.addEventListener("visibilitychange", visibility)
  publishProjectMeters(session)
  return {
    session,
    setActive(next: boolean) {
      if (disposed || active === next) return
      active = next
      previous = null
      detachInterest()
      detachInterest = session.store.setInterest("native-transport", {
        endpointIds: [],
        transport: next,
      })
    },
    async dispose() {
      if (disposed) return session.dispose()
      disposed = true
      document.removeEventListener("visibilitychange", visibility)
      detachFrames()
      detachInterest()
      if (readProjectMeters() === session) publishProjectMeters(null)
      await session.dispose()
    },
  }
}
