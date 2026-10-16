import type {
  BackendRequest,
  BackendResult,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
} from "../../model/backend"

const MIN_BAR = 1
const TICK_MS = 50

function wrapBar(bar: number, state: BackendState): number {
  const { loop } = state.project
  return !loop.enabled || loop.endBar <= loop.startBar || bar < loop.endBar
    ? bar
    : loop.startBar + ((bar - loop.startBar) % (loop.endBar - loop.startBar))
}

export function createMockProjectBackend(): ProjectBackend {
  let state: BackendState | null = null
  let sessionId = ""
  let sequence = -1
  let sampleSequence = 0
  let revision = 0
  let bar = MIN_BAR
  let timestamp = performance.now()
  let isDisposed = false
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  let timer: NodeJS.Timeout | undefined

  function currentBar(now: number): number {
    if (!state?.control.playing || !listeners.size) {
      return bar
    }
    const barsPerSecond =
      (state.project.bpm * state.project.denominator) / (240 * state.project.numerator)
    return wrapBar(bar + (Math.max(0, now - timestamp) * barsPerSecond) / 1000, state)
  }

  function frame(now: number): BackendTelemetry | null {
    if (!state) {
      return null
    }
    const position = currentBar(now)
    const barsPerSecond =
      (state.project.bpm * state.project.denominator) / (240 * state.project.numerator)
    return {
      sessionId,
      sequence: ++sampleSequence,
      appliedSequence: sequence,
      clock: { kind: "musical", bar: position, barsPerSecond },
      playing: state.control.playing,
      recording: state.control.recording,
      levels: Object.fromEntries(state.project.tracks.map(track => [track.id, [-120, -120]])),
      outputLatencyFrames: null,
    }
  }

  function emit(): void {
    if (!listeners.size) {
      return
    }
    const current = frame(performance.now())
    if (current) {
      for (const listener of listeners) {
        listener(current)
      }
    }
  }
  function reconcileTimer(): void {
    const active =
      listeners.size > 0 && (state?.control.playing || Boolean(state?.control.heldNotes.length))
    if (active && !timer) {
      timer = setInterval(emit, TICK_MS)
    } else if (!active && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  return {
    apply(request: BackendRequest): BackendResult {
      if (isDisposed) {
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "disposed",
        }
      }
      if (request.stage === "open") {
        if (
          state ||
          request.sequence !== 0 ||
          request.revision !== 0 ||
          request.baseRevision !== 0
        ) {
          return {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            code: "protocol",
          }
        }
        sessionId = request.sessionId
        sequence = 0
      } else if (
        !state ||
        request.sessionId !== sessionId ||
        request.sequence <= sequence ||
        request.baseRevision !== revision
      ) {
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "protocol",
        }
      }
      const now = performance.now()
      const previousBar = currentBar(now)
      const previousControl = state?.control
      state = request.state
      sequence = request.sequence
      if (request.stage === "open" || request.stage === "commit" || request.stage === "recover") {
        revision = request.revision
      }
      bar =
        request.stage === "open" ||
        request.state.control.seekGeneration !== previousControl?.seekGeneration
          ? request.state.control.seekBar
          : previousBar
      bar = wrapBar(bar, request.state)
      timestamp = now
      emit()
      reconcileTimer()
      return { kind: "accepted", sessionId, sequence, revision }
    },
    subscribe(listener) {
      if (isDisposed) {
        return () => {}
      }
      listeners.add(listener)
      if (listeners.size === 1) {
        timestamp = performance.now()
      }
      reconcileTimer()
      const current = frame(performance.now())
      if (current) {
        listener(current)
      }
      return () => {
        if (!listeners.has(listener)) {
          return
        }
        if (listeners.size === 1) {
          const now = performance.now()
          bar = currentBar(now)
          timestamp = now
        }
        listeners.delete(listener)
        reconcileTimer()
      }
    },
    readPeaks(_sourceId, _startBar, _endBar, pixels) {
      return new Float32Array(isDisposed ? 0 : pixels * 4)
    },
    dispose() {
      isDisposed = true
      listeners.clear()
      clearInterval(timer)
      timer = undefined
      state = null
    },
  }
}
