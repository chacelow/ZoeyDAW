import { createProbePainter } from "./paint"
import { MAX_RAW_SAMPLES, caseKey, distribution, errorMessage } from "./model"
import type {
  ClockMapping,
  CloseOutcome,
  FrameSample,
  NativeClose,
  ProbeCase,
  ProbeCaseReport,
  ProbeProgress,
  RequestSample,
} from "./model"
import {
  Channel,
  boundedAwait,
  closeProbe,
  measureClock,
  openProbe,
  parseFrame,
  pullProbe,
  receiptProbe,
} from "./transport"
import type { ProbeFrame } from "./transport"

type PendingFrame = { readonly bytes: ArrayBuffer; readonly receivedMs: number }
type PullFlight = { readonly sentMs: number; readonly generation: number; stalled: boolean }

export async function runProbeCase(options: {
  readonly config: ProbeCase
  readonly canvas: HTMLCanvasElement
  readonly signal: AbortSignal
  readonly onProgress: (progress: ProbeProgress) => void
}): Promise<ProbeCaseReport> {
  const { config, canvas, signal, onProgress } = options
  if (
    !Number.isInteger(config.durationSeconds) ||
    config.durationSeconds < 4 ||
    config.durationSeconds > 20
  ) {
    throw new Error("Probe duration must be an integer between 4 and 20 seconds")
  }
  if (!Number.isInteger(config.bytes) || config.bytes < 32 || config.bytes > 262144) {
    throw new Error("Probe byte count must be 32..262144")
  }
  const key = caseKey(config)
  const startedAt = new Date().toISOString()
  const painter = createProbePainter(canvas, key)
  let startedMs = performance.now()
  let endedMs = startedMs
  let clock: ClockMapping | null = null
  let status: ProbeCaseReport["status"] = "completed"
  let failure: string | null = null
  let disposed = false
  let finished = false
  let id: string | null = null
  let openPending = false
  let generation = 0
  let pending: PendingFrame | null = null
  let inFlight: PullFlight | null = null
  let receiptInFlight = false
  let closeTask: Promise<NativeClose> | null = null
  let closeOutcome: CloseOutcome = { kind: "not-opened" }
  let animationId: number | null = null
  let blockTimer: ReturnType<typeof setTimeout> | undefined
  let stopTimer: ReturnType<typeof setTimeout> | undefined
  let lastRafMs: number | null = null
  let nextConsumerMs = 0
  let lastProgressMs = 0
  let recoveryFloorMs = Number.NEGATIVE_INFINITY
  let stale = false
  let lastSeq = 0n
  let sequenceGaps = 0n
  let intentionalBlockMs: number | null = null
  let receivedFrames = 0
  let receivedBytes = 0
  let emptyPulls = 0
  let overwrittenFrames = 0
  let oldFrames = 0
  let invalidFrames = 0
  let recoveryGaps = 0
  let stalledPulls = 0
  let maxPullInFlight = 0
  let maxPendingBuffers = 0
  let truncatedRawSamples = 0
  const frames: FrameSample[] = []
  const rafIntervalsMs: number[] = []
  const pulls: RequestSample[] = []
  const receiptRoundTripsMs: number[] = []
  const errors: string[] = []
  let settle: (() => void) | null = null
  // ES2022 is this app's runtime/lib baseline; Promise.withResolvers is not required.
  const done = new Promise<void>(resolve => {
    settle = resolve
  })

  function append<T>(series: T[], sample: T, maximum = MAX_RAW_SAMPLES) {
    if (series.length < maximum) series.push(sample)
    else truncatedRawSamples += 1
  }

  function finish(nextStatus: ProbeCaseReport["status"], error: string | null = null) {
    if (finished) return
    finished = true
    endedMs = performance.now()
    status = nextStatus
    failure = error
    if (error) append(errors, error, 64)
    settle?.()
  }

  function ensureClose(sessionId: string) {
    if (closeTask) return
    closeOutcome = { kind: "pending" }
    closeTask = closeProbe(sessionId)
    closeTask
      .then(counters => {
        closeOutcome = { kind: "closed", counters }
      })
      .catch((error: unknown) => {
        closeOutcome = { kind: "error", error: errorMessage(error) }
      })
  }

  function acceptDelivery(value: unknown, receivedMs: number) {
    if (disposed || finished) return
    if (!(value instanceof ArrayBuffer)) {
      invalidFrames += 1
      finish("error", "Probe Channel did not deliver raw ArrayBuffer")
      return
    }
    if (value.byteLength === 0) {
      emptyPulls += 1
      return
    }
    receivedFrames += 1
    receivedBytes += value.byteLength
    if (pending) overwrittenFrames += 1
    pending = { bytes: value, receivedMs }
    maxPendingBuffers = 1
  }

  let channel: Channel<ArrayBuffer> | null = null

  function startPull(sessionId: string) {
    if (inFlight || disposed || finished) return
    const flight: PullFlight = { sentMs: performance.now(), generation, stalled: false }
    inFlight = flight
    maxPullInFlight = 1
    pullProbe(sessionId, lastSeq.toString())
      .then(bytes => {
        if (disposed || finished) return
        const completedMs = performance.now()
        const discarded = flight.generation !== generation
        append(
          pulls,
          { sentMs: flight.sentMs, completedMs, bytes: bytes.byteLength, discarded },
          1200
        )
        if (discarded) {
          if (bytes.byteLength > 0) {
            receivedFrames += 1
            receivedBytes += bytes.byteLength
            oldFrames += 1
          }
          return
        }
        acceptDelivery(bytes, completedMs)
      })
      .catch((error: unknown) => {
        if (!disposed && !finished) finish("error", errorMessage(error))
      })
      .finally(() => {
        if (inFlight === flight) inFlight = null
      })
  }

  function receipt(sessionId: string, seq: bigint) {
    const sentMs = performance.now()
    receiptInFlight = true
    receiptProbe(sessionId, seq.toString())
      .then(() => {
        if (!disposed && !finished) append(receiptRoundTripsMs, performance.now() - sentMs, 1200)
      })
      .catch((error: unknown) => {
        if (!disposed && !finished) finish("error", errorMessage(error))
      })
      .finally(() => {
        receiptInFlight = false
      })
  }

  function consume(sessionId: string, mapping: ClockMapping) {
    if (!pending || (config.mode === "credit" && receiptInFlight)) return
    const delivery = pending
    pending = null
    let frame: ProbeFrame
    try {
      frame = parseFrame(delivery.bytes, config.bytes)
    } catch (error) {
      invalidFrames += 1
      finish("error", errorMessage(error))
      return
    }
    const producedClientMs = frame.producedMs + mapping.offsetMs
    if (frame.seq <= lastSeq || producedClientMs - mapping.uncertaintyMs < recoveryFloorMs) {
      oldFrames += 1
    } else {
      if (lastSeq > 0n) sequenceGaps += frame.seq - lastSeq - 1n
      if (performance.now() - producedClientMs < -mapping.uncertaintyMs) {
        invalidFrames += 1
        finish("error", "Native timestamp lies outside the measured clock uncertainty")
        return
      }
      const proof = painter.paint(frame)
      const paintedMs = proof.paintedMs
      const ageEstimateMs = paintedMs - producedClientMs
      stale = false
      append(
        frames,
        {
          seq: frame.seq.toString(),
          producedMonotonicNs: frame.producedNs.toString(),
          receivedMs: delivery.receivedMs,
          paintedMs,
          ageEstimateMs,
          ageUpperMs: Math.max(0, ageEstimateMs + mapping.uncertaintyMs),
          deliveryToPaintMs: paintedMs - delivery.receivedMs,
          bytes: delivery.bytes.byteLength,
        },
        1200
      )
    }
    if (frame.seq > lastSeq) lastSeq = frame.seq
    if (config.mode === "credit") receipt(sessionId, frame.seq)
  }

  function tick(now: number) {
    if (disposed || finished || !id || !clock) return
    if (lastRafMs !== null) {
      const gap = now - lastRafMs
      append(rafIntervalsMs, gap)
      if (gap > 250) {
        generation += 1
        recoveryGaps += 1
        recoveryFloorMs = performance.now()
        stale = true
        painter.stale()
        // Credit must consume/receipt the discarded frame to release its one native credit.
        // Pull responses retain their generation and cannot repopulate pending after recovery.
        if (pending && config.mode !== "credit") {
          oldFrames += 1
          pending = null
        }
      }
    }
    lastRafMs = now
    if (inFlight && !inFlight.stalled && performance.now() - inFlight.sentMs > 500) {
      inFlight.stalled = true
      stalledPulls += 1
      generation += 1
      recoveryFloorMs = performance.now()
      stale = true
      painter.stale()
    }
    if (now >= nextConsumerMs) {
      // Absolute slots cap a 120/144Hz rAF stream at 60, without a catch-up loop.
      const interval = 1000 / 60
      nextConsumerMs = (Math.floor(now / interval) + 1) * interval
      try {
        consume(id, clock)
        if (config.mode === "pull") startPull(id)
      } catch (error) {
        finish("error", errorMessage(error))
      }
    }
    if (now - lastProgressMs >= 250 && !finished) {
      lastProgressMs = now
      onProgress({
        caseKey: key,
        elapsedMs: performance.now() - startedMs,
        painted: frames.length,
        received: receivedFrames,
        state: inFlight?.stalled ? "stalled" : stale ? "stale" : "running",
      })
    }
    if (!finished) animationId = requestAnimationFrame(tick)
  }

  const onAbort = () => finish("cancelled")
  const onVisibility = () => {
    if (document.visibilityState !== "visible")
      finish("cancelled", "Document hidden; measurement interrupted")
  }
  signal.addEventListener("abort", onAbort, { once: true })
  document.addEventListener("visibilitychange", onVisibility)
  try {
    if (signal.aborted) throw new DOMException("Probe cancelled", "AbortError")
    if (document.visibilityState !== "visible") throw new Error("Probe window must be visible")
    clock = await measureClock(signal)
    if (finished) throw new DOMException("Probe cancelled", "AbortError")
    channel = new Channel<ArrayBuffer>(value => acceptDelivery(value, performance.now()))
    const opening = openProbe({ bytes: config.bytes, mode: config.mode, channel })
    openPending = true
    // A timed-out/cancelled open may complete later. Close that actual id once, never invent cancellation.
    opening
      .then(opened => {
        openPending = false
        id = opened.id
        if (disposed || finished) ensureClose(opened.id)
      })
      .catch(() => {
        openPending = false
      })
    const opened = await boundedAwait(opening, signal, 2500)
    if (opened.bytes !== config.bytes)
      throw new Error("Native probe payload size differs from the requested case")
    if (finished) throw new DOMException("Probe cancelled", "AbortError")
    // eslint-disable-next-line require-atomic-updates -- This run owns startedMs; callbacks only read it and cannot race its assignment.
    startedMs = performance.now()
    onProgress({
      caseKey: key,
      elapsedMs: 0,
      painted: 0,
      received: receivedFrames,
      state: "running",
    })
    stopTimer = setTimeout(() => finish("completed"), config.durationSeconds * 1000)
    if (config.scenario === "block") {
      blockTimer = setTimeout(() => {
        if (disposed || finished) return
        const blockStarted = performance.now()
        while (performance.now() - blockStarted < 1200) {
          // Deliberate synchronous UI stall; no timer/display/audio simulation.
        }
        intentionalBlockMs = performance.now() - blockStarted
      }, 1000)
    }
    animationId = requestAnimationFrame(tick)
    await done
  } catch (error) {
    finish(signal.aborted ? "cancelled" : "error", signal.aborted ? null : errorMessage(error))
  } finally {
    disposed = true
    generation += 1
    pending = null
    if (animationId !== null) cancelAnimationFrame(animationId)
    clearTimeout(blockTimer)
    clearTimeout(stopTimer)
    signal.removeEventListener("abort", onAbort)
    document.removeEventListener("visibilitychange", onVisibility)
    if (status === "completed" && frames.length === 0) {
      status = "error"
      failure = "No validated native frame was painted during this case"
      append(errors, failure, 64)
    }
    // Channel cleanup is owned by Tauri's native end message; there is no public JS cancel API.
    if (channel)
      channel.onmessage = () => {
        /* Ignore delivery after this case has released its owner. */
      }
    if (id) ensureClose(id)
    if (closeTask) {
      try {
        await boundedAwait(closeTask, new AbortController().signal, 1000)
      } catch {
        /* closeOutcome retains its actual error or pending state; no claim of remote cancellation. */
      }
    } else if (openPending) {
      closeOutcome = { kind: "pending" }
    }
  }
  return finishReport()

  function finishReport(): ProbeCaseReport {
    const durationMs = Math.max(0, endedMs - startedMs)
    const rafIntervalMs = distribution(rafIntervalsMs)
    return {
      caseKey: key,
      config,
      startedAt,
      status,
      error: failure,
      durationMs,
      clock,
      nativeClose: closeOutcome,
      counters: {
        receivedFrames,
        paintedFrames: frames.length,
        receivedBytes,
        emptyPulls,
        overwrittenFrames,
        oldFrames,
        invalidFrames,
        sequenceGaps: sequenceGaps.toString(),
        recoveryGaps,
        stalledPulls,
        maxPullInFlight,
        maxPendingBuffers,
        truncatedRawSamples,
      },
      throughputBytesPerSecond: durationMs > 0 ? (receivedBytes * 1000) / durationMs : null,
      ageUpperMs: distribution(frames.map(frame => frame.ageUpperMs)),
      deliveryToPaintMs: distribution(frames.map(frame => frame.deliveryToPaintMs)),
      rafIntervalMs,
      pullRoundTripMs: distribution(pulls.map(pull => pull.completedMs - pull.sentMs)),
      observedRafHz:
        rafIntervalMs.p50 !== null && rafIntervalMs.p50 > 0 ? 1000 / rafIntervalMs.p50 : null,
      intentionalBlockMs,
      lastPaint: painter.latest(),
      raw: { frames, rafIntervalsMs, pulls, receiptRoundTripsMs, errors },
    }
  }
}
