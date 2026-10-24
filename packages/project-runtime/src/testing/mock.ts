import { mockMeterLevels } from "./mock-meters"
import { controlGenerationValue } from "../backend/connection/protocol"
import type {
  BackendControl,
  BackendControlRequest,
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

/** Deterministic visual backend: no PCM, store, or browser audio ownership. */
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
  const notes = new Map<string, Map<string, BackendNote>>()
  let timer: ReturnType<typeof setInterval> | undefined

  function currentBar(now: number): number {
    if (!state?.control.playing || !listeners.size) return bar
    const barsPerSecond =
      (state.project.bpm * state.project.denominator) / (240 * state.project.numerator)
    return wrapBar(bar + (Math.max(0, now - timestamp) * barsPerSecond) / 1000, state)
  }
  function frame(now: number): BackendTelemetry | null {
    if (!state) return null
    const position = currentBar(now)
    const barsPerSecond =
      (state.project.bpm * state.project.denominator) / (240 * state.project.numerator)
    return {
      sessionId,
      sequence: ++sampleSequence,
      appliedSequence: sequence,
      controlGeneration,
      clock: { kind: "musical", bar: position, barsPerSecond },
      playing: state.control.playing,
      recording: state.control.recording,
      levels: mockMeterLevels(
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
    }
  }
  function emit(): void {
    if (!listeners.size) return
    const current = frame(performance.now())
    if (current) for (const listener of listeners) listener(current)
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

  return {
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
      for (const id of notes.keys())
        if (!state.project.tracks.some(track => track.id === id)) notes.delete(id)
      emit()
      reconcileTimer()
      return result()
    },
    control(request): BackendResult {
      if (isDisposed) return rejected(request, "disposed")
      if (
        !validControlRequest(request) ||
        !state ||
        request.sessionId !== sessionId ||
        request.sequence <= sequence
      ) {
        return rejected(request, "protocol")
      }
      applyControl(request.control, request.controlGeneration, performance.now())
      sequence = request.sequence
      emit()
      reconcileTimer()
      return result()
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
      notes.clear()
      clearInterval(timer)
      timer = undefined
      state = null
    },
  }
}
