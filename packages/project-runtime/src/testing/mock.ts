import { secondsAtBar, barAtSeconds, tempoAtBar } from "@zoeydaw/project-core/tempo-map"
import { mockMeterLevels } from "./mock-meters"
import { createMockMeterStream } from "./mock-meter-store"
import { controlGenerationValue } from "../backend/connection/protocol"
import { createMockLauncher } from "./mock-launcher"
import type {
  BackendControl,
  BackendControlRequest,
  BackendLauncherSnapshot,
  BackendDocumentRequest,
  BackendNote,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"

const MIN_BAR = 1
const TICK_MS = 50
function wrapBar(bar: number, state: BackendState): number {
  const { loop } = state.project
  return !loop.enabled || loop.endBar <= loop.startBar || bar < loop.endBar
    ? bar
    : loop.startBar + ((bar - loop.startBar) % (loop.endBar - loop.startBar))
}

/** Deterministic visual backend: no PCM or browser audio ownership. */
export function createMockProjectBackend(): ProjectBackend {
  let state: BackendState | null = null
  let sessionId = ""
  let sequence = -1
  let sampleSequence = 0
  let noteSequence = 0
  let revision = 0
  let controlGeneration = "0"
  let bar = MIN_BAR
  let timestamp = performance.now()
  let isDisposed = false
  const listeners = new Set<(frame: BackendTelemetry) => void>()
  const launcherListeners = new Set<(frame: BackendLauncherSnapshot) => void>()
  const launcher = createMockLauncher()
  const notes = new Map<string, Map<string, BackendNote>>()
  const meters = createMockMeterStream()
  let timer: ReturnType<typeof setInterval> | undefined

  function currentBar(now: number): number {
    if (!state?.control.playing || !listeners.size) return bar
    return wrapBar(
      barAtSeconds(
        state.project,
        secondsAtBar(state.project, bar) + Math.max(0, now - timestamp) / 1000
      ),
      state
    )
  }
  function frame(now: number): BackendTelemetry | null {
    if (!state) return null
    const position = currentBar(now)
    const barsPerSecond =
      (tempoAtBar(state.project, position) * state.project.denominator) /
      (240 * state.project.numerator)
    meters.publish(
      mockMeterLevels(
        {
          document: {
            tracks: state.project.tracks,
            transport: { numerator: state.project.numerator },
          },
          session: { playing: state.control.playing, activeMidiNotes: [] },
        },
        position,
        now,
        new Map([...notes].map(([trackId, held]) => [trackId, held.size]))
      ),
      now,
      position,
      tempoAtBar(state.project, position),
      (state.project.numerator * 4) / state.project.denominator,
      state.control.playing,
      state.control.recording,
      controlGeneration,
      revision,
      secondsAtBar(state.project, position)
    )
    return {
      sessionId,
      sequence: ++sampleSequence,
      appliedSequence: sequence,
      controlGeneration,
      clock: { kind: "musical", bar: position, barsPerSecond },
      playing: state.control.playing,
      recording: state.control.recording,
    }
  }
  function emit(): void {
    if (!listeners.size && !state) return
    const current = frame(performance.now())
    if (current) for (const listener of listeners) listener(current)
    if (state) {
      const snapshot = launcher.read(state, sessionId, sequence)
      for (const listener of launcherListeners) listener(snapshot)
    }
  }
  function reconcileTimer(): void {
    const active = listeners.size > 0 && (state?.control.playing || notes.size > 0)
    if (active && !timer) timer = setInterval(emit, TICK_MS)
    else if (!active && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
  function applyControl(
    control: BackendControl,
    generation: string,
    now: number,
    opening = false
  ): void {
    if (!state || BigInt(generation) < BigInt(controlGeneration)) return
    const previousBar = currentBar(now)
    const seek = opening || control.seekGeneration !== state.control.seekGeneration
    state = { project: state.project, control }
    controlGeneration = generation
    bar = wrapBar(seek ? control.seekBar : previousBar, state)
    timestamp = now
  }
  function rejected(
    request: BackendDocumentRequest | BackendControlRequest,
    code: "disposed" | "protocol"
  ): BackendResult {
    return {
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      controlGeneration: request.controlGeneration,
      code,
    }
  }
  function validControlRequest(request: BackendDocumentRequest | BackendControlRequest): boolean {
    return (
      request.protocolVersion === 2 &&
      Number.isSafeInteger(request.sequence) &&
      request.sequence >= 0 &&
      controlGenerationValue(request.controlGeneration) !== null
    )
  }
  function result(): BackendResult {
    return { kind: "accepted", sessionId, sequence, revision, controlGeneration }
  }

  function performControl(request: BackendControlRequest): BackendResult {
    if (isDisposed) return rejected(request, "disposed")
    if (
      !validControlRequest(request) ||
      !state ||
      request.sessionId !== sessionId ||
      request.sequence <= sequence
    )
      return rejected(request, "protocol")
    applyControl(request.control, request.controlGeneration, performance.now())
    sequence = request.sequence
    emit()
    reconcileTimer()
    return result()
  }
  return {
    readMeters: () => (isDisposed ? null : meters.store),
    apply(request): BackendResult {
      if (isDisposed) return rejected(request, "disposed")
      if (!validControlRequest(request)) return rejected(request, "protocol")
      if (request.stage === "open") {
        if (state || request.revision !== 0 || request.baseRevision !== 0) {
          return rejected(request, "protocol")
        }
        sessionId = request.sessionId
      } else if (
        !state ||
        request.sessionId !== sessionId ||
        request.sequence <= sequence ||
        request.baseRevision !== revision
      )
        return rejected(request, "protocol")
      const now = performance.now()
      const previousBar = currentBar(now)
      const previousControl = state?.control ?? request.state.control
      state = { project: request.state.project, control: previousControl }
      bar = previousBar
      timestamp = now
      applyControl(request.state.control, request.controlGeneration, now, request.stage === "open")
      sequence = request.sequence
      if (request.stage === "open" || request.stage === "commit" || request.stage === "recover")
        revision = request.revision
      meters.updateSession(sessionId, state.project.tracks)
      for (const id of notes.keys())
        if (!state.project.tracks.some(track => track.id === id)) notes.delete(id)
      emit()
      reconcileTimer()
      return result()
    },
    control: performControl,
    launch(request) {
      if (!state || !launcher.valid(request, state)) return rejected(request, "protocol")
      const result = performControl(request)
      if (result.kind === "accepted" && state) {
        launcher.apply(request, state, currentBar(performance.now()))
        emit()
      }
      return result
    },
    subscribeLauncher(listener) {
      launcherListeners.add(listener)
      if (state) listener(launcher.read(state, sessionId, sequence))
      return () => {
        launcherListeners.delete(listener)
      }
    },
    note(request: BackendNoteRequest): BackendNoteResult {
      const code = isDisposed
        ? "disposed"
        : !state ||
            request.protocolVersion !== 2 ||
            request.sessionId !== sessionId ||
            !Number.isSafeInteger(request.sequence) ||
            request.sequence <= noteSequence ||
            !request.note.noteId ||
            !Number.isInteger(request.note.pitch) ||
            request.note.pitch < 0 ||
            request.note.pitch > 127 ||
            !Number.isInteger(request.note.velocity) ||
            request.note.velocity < 0 ||
            request.note.velocity > 127 ||
            (request.note.requestedSample !== undefined &&
              controlGenerationValue(request.note.requestedSample) === null) ||
            !state.project.tracks.some(
              track => track.id === request.note.trackId && track.kind === "midi"
            )
          ? "protocol"
          : null
      if (code)
        return { kind: "rejected", sessionId: request.sessionId, sequence: request.sequence, code }
      noteSequence = request.sequence
      const held = notes.get(request.note.trackId) ?? new Map<string, BackendNote>()
      if (request.note.on) {
        held.set(request.note.noteId, request.note)
        notes.set(request.note.trackId, held)
      } else {
        held.delete(request.note.noteId)
        if (!held.size) notes.delete(request.note.trackId)
      }
      emit()
      reconcileTimer()
      return { kind: "accepted", sessionId, sequence: noteSequence }
    },
    allNotesOff() {
      notes.clear()
      emit()
      reconcileTimer()
    },
    async urgentStop() {
      const now = performance.now()
      bar = currentBar(now)
      timestamp = now
      notes.clear()
      if (state)
        state = { ...state, control: { ...state.control, playing: false, recording: false } }
      emit()
      reconcileTimer()
    },
    subscribe(listener) {
      if (isDisposed) return () => {}
      listeners.add(listener)
      if (listeners.size === 1) timestamp = performance.now()
      reconcileTimer()
      const current = frame(performance.now())
      if (current) listener(current)
      return () => {
        if (!listeners.has(listener)) return
        if (listeners.size === 1) {
          const now = performance.now()
          bar = currentBar(now)
          timestamp = now
        }
        listeners.delete(listener)
        reconcileTimer()
      }
    },
    dispose() {
      isDisposed = true
      listeners.clear()
      launcherListeners.clear()
      launcher.clear()
      notes.clear()
      clearInterval(timer)
      timer = undefined
      state = null
      meters.store.dispose()
    },
  }
}
