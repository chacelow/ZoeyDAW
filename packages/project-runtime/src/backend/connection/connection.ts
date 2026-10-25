import { validResult, validFrame, validNoteResult, controlGenerationValue } from "./protocol"
import { interpolate } from "./telemetry"
import type {
  BackendControl,
  BackendControlRequest,
  BackendDocumentRequest,
  BackendFailureCode,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendStage,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
  ProjectBackendFactory,
  ProjectRuntimeStatus,
} from "@zoeydaw/project-core/backend"
import type { MeterStore } from "@zoeydaw/project-core/realtime"

export interface BackendSubmission {
  stage: Exclude<BackendStage, "open">
  revision: number
  editId: string | null
  state: BackendState
}
export interface BackendConnectionOptions {
  factory: ProjectBackendFactory
  onAccepted: (request: BackendDocumentRequest) => void
  onRejected: (request: BackendDocumentRequest, code: BackendFailureCode) => void
  onControlAccepted?: (request: BackendControlRequest) => void
  onControlRejected?: (request: BackendControlRequest, code: BackendFailureCode) => void
  onNoteRejected?: (code: BackendFailureCode | "note-overrun") => void
  onStatus: (status: ProjectRuntimeStatus) => void
  onTelemetry: (frame: BackendTelemetry) => void
}
export interface BackendConnection {
  open: (sessionId: string, state: BackendState) => void
  submit: (input: BackendSubmission) => number
  submitControl: (control: BackendControl) => void
  submitNote: (note: BackendNoteRequest["note"]) => void
  start: () => () => void
  readTelemetry: () => BackendTelemetry | null
  readMeters: () => MeterStore | null
  whenIdle: () => Promise<boolean>
  dispose: () => void
}

type Dispatch =
  | { kind: "document"; request: BackendDocumentRequest }
  | { kind: "control"; request: BackendControlRequest }
interface TimedFrame {
  frame: BackendTelemetry
  receivedAt: number
  correction?: number
}
const NOTE_CAPACITY = 4096
const MAX_GENERATION = (1n << 64n) - 1n

function sameControl(a: BackendControl | null, b: BackendControl): boolean {
  return (
    a !== null &&
    a.playing === b.playing &&
    a.recording === b.recording &&
    a.seekBar === b.seekBar &&
    a.seekGeneration === b.seekGeneration &&
    a.metronome === b.metronome
  )
}

export function createBackendConnection(options: BackendConnectionOptions): BackendConnection {
  let backend: ProjectBackend | null = null
  let unsubscribe: (() => void) | null = null
  let leases = 0
  let epoch = 0
  let sessionId = ""
  let isDisposed = false
  let sequence = -1
  let ticket = 0
  let acceptedSequence = -1
  let acceptedRevision = 0
  let controlSequence = 0
  let generation = 0n
  let acceptedGeneration = 0n
  let latestControl: BackendControl | null = null
  let pendingControl = false
  let controlMayJump = true
  let acceptedState: BackendState | null = null
  let inFlight: Dispatch | null = null
  let queue: BackendSubmission[] = []
  let pendingOpen: BackendState | null = null
  let isDraining = false
  let frame: TimedFrame | null = null
  let buffered: TimedFrame | null = null
  let error: ProjectRuntimeStatus["error"] = null
  let isFailed = false
  let noteSequence = 0
  let noteEpoch = 0
  let noteInFlight: BackendNoteRequest | null = null
  let notes: BackendNoteRequest["note"][] = []
  let drainingNotes = false
  let panickingNotes = false
  const waiters: { epoch: number; resolve: (success: boolean) => void }[] = []

  function pending(): number {
    return (
      queue.length +
      Number(inFlight !== null) +
      Number(pendingControl) +
      Number(pendingOpen !== null) +
      notes.length +
      Number(noteInFlight !== null) +
      Number(panickingNotes)
    )
  }
  function status(): void {
    const count = pending()
    const phase = error ? "error" : acceptedSequence < 0 ? "opening" : count ? "pending" : "ready"
    options.onStatus({ phase, sessionId, pending: count, acceptedRevision, error })
  }
  function settleIdle(): void {
    if (pending()) return
    for (const waiter of waiters.splice(0)) waiter.resolve(waiter.epoch === epoch && !isFailed)
  }
  function takeFrame(candidate: TimedFrame): void {
    const value = controlGenerationValue(candidate.frame.controlGeneration)
    if (
      !acceptedState ||
      value === null ||
      value < generation ||
      value > acceptedGeneration ||
      candidate.frame.appliedSequence > acceptedSequence ||
      candidate.frame.appliedSequence < controlSequence ||
      (frame &&
        (candidate.frame.sequence <= frame.frame.sequence ||
          candidate.frame.appliedSequence < frame.frame.appliedSequence))
    )
      return
    if (
      frame &&
      frame.frame.playing &&
      candidate.frame.playing &&
      frame.frame.controlGeneration === candidate.frame.controlGeneration &&
      candidate.frame.clock.bar >= frame.frame.clock.bar
    ) {
      const previous = interpolate(
        frame.frame,
        frame.receivedAt,
        acceptedState,
        candidate.receivedAt,
        frame.correction
      )
      candidate.correction = Math.max(0, previous.clock.bar - candidate.frame.clock.bar)
    }
    frame = candidate
    options.onTelemetry(candidate.frame)
  }
  function receiveTelemetry(candidate: BackendTelemetry, receivedEpoch: number): void {
    if (
      isDisposed ||
      receivedEpoch !== epoch ||
      !leases ||
      !validFrame(candidate, sessionId) ||
      candidate.appliedSequence > sequence ||
      candidate.appliedSequence < controlSequence
    )
      return
    const value = controlGenerationValue(candidate.controlGeneration)
    if (value === null || value < generation) return
    const timed = { frame: candidate, receivedAt: performance.now() }
    if (candidate.appliedSequence === inFlight?.request.sequence) {
      if (!buffered || candidate.sequence >= buffered.frame.sequence) buffered = timed
      return
    }
    takeFrame(timed)
  }
  function subscribe(): void {
    if (!backend || !leases || unsubscribe) return
    const currentEpoch = epoch
    try {
      unsubscribe = backend.subscribe(candidate => receiveTelemetry(candidate, currentEpoch))
    } catch {
      error = "connection"
      status()
    }
  }
  function clearBackend(): void {
    unsubscribe?.()
    unsubscribe = null
    backend?.dispose()
    backend = null
  }
  function stopImmediately(): void {
    const currentEpoch = epoch
    const currentBackend = backend
    try {
      void currentBackend?.urgentStop?.().catch(() => {
        if (epoch !== currentEpoch || backend !== currentBackend || isDisposed) return
        error = "connection"
        isFailed = true
        status()
      })
    } catch {
      error = "connection"
      isFailed = true
      status()
    }
  }
  function panicNotes(): void {
    if (!backend || panickingNotes) return
    const currentEpoch = epoch
    const currentBackend = backend
    panickingNotes = true
    let isSynchronous = true
    const finish = (failed: boolean): void => {
      if (isDisposed || epoch !== currentEpoch || backend !== currentBackend) return
      panickingNotes = false
      if (failed) {
        clearNotes()
        error = "connection"
        isFailed = true
        options.onNoteRejected?.("connection")
      }
      status()
      if (!isSynchronous) {
        drainNotes()
        settleIdle()
      }
    }
    try {
      const result = currentBackend.allNotesOff()
      if (result)
        void result.then(
          () => finish(false),
          () => finish(true)
        )
      else finish(false)
    } catch {
      finish(true)
    } finally {
      isSynchronous = false
    }
  }
  function updateControl(control: BackendControl): void {
    if (sameControl(latestControl, control)) return
    if (!control.playing && (latestControl?.playing || acceptedState?.control.playing)) {
      clearNotes()
      stopImmediately()
    }
    if (generation === MAX_GENERATION) throw new Error("Control generation exhausted")
    generation++
    latestControl = { ...control }
  }
  function clearNotes(): void {
    noteEpoch++
    notes = []
    noteInFlight = null
  }
  function reject(dispatch: Dispatch, code: BackendFailureCode): void {
    queue = []
    pendingOpen = null
    pendingControl = false
    buffered = null
    clearNotes()
    error = code
    isFailed = true
    panicNotes()
    if (acceptedState) updateControl(acceptedState.control)
    if (dispatch.kind === "document") options.onRejected(dispatch.request, code)
    else options.onControlRejected?.(dispatch.request, code)
  }
  function complete(dispatch: Dispatch, result: unknown, currentEpoch: number): void {
    if (isDisposed || currentEpoch !== epoch || inFlight !== dispatch) return
    inFlight = null
    const request = dispatch.request
    const expectedRevision =
      dispatch.kind === "document" &&
      (dispatch.request.stage === "open" ||
        dispatch.request.stage === "commit" ||
        dispatch.request.stage === "recover")
        ? dispatch.request.revision
        : acceptedRevision
    if (
      !validResult(result) ||
      result.sessionId !== sessionId ||
      result.sequence !== request.sequence ||
      result.controlGeneration !== request.controlGeneration ||
      (result.kind === "accepted" && result.revision !== expectedRevision)
    ) {
      reject(dispatch, "protocol")
    } else if (result.kind === "rejected") {
      if (result.code === "superseded-open") {
        if (
          dispatch.kind === "document" &&
          dispatch.request.stage === "open" &&
          acceptedSequence < 0 &&
          latestControl &&
          generation > BigInt(request.controlGeneration)
        ) {
          pendingOpen = { project: dispatch.request.state.project, control: latestControl }
          buffered = null
        } else reject(dispatch, "protocol")
      } else reject(dispatch, result.code)
    } else {
      acceptedSequence = request.sequence
      acceptedGeneration = BigInt(result.controlGeneration)
      if (dispatch.kind === "document") {
        const document = dispatch.request
        acceptedRevision = expectedRevision
        // A document queued before a later Play/Record change still carries the older flags.
        // Adopting them would roll the transport back, so keep the newer transport state while
        // retaining the document's own seek position.
        const documentControl = document.state.control
        const newer =
          latestControl !== null && generation > BigInt(document.controlGeneration)
            ? latestControl
            : null
        const merged = newer
          ? {
              ...documentControl,
              playing: newer.playing,
              recording: newer.recording,
              metronome: newer.metronome,
            }
          : documentControl
        acceptedState = { ...document.state, control: merged }
        if (document.stage === "commit") error = null
        if (document.stage === "commit" || document.stage === "recover") isFailed = false
        options.onAccepted({ ...document, state: { ...document.state, control: merged } })
      } else {
        if (acceptedState) acceptedState = { ...acceptedState, control: dispatch.request.control }
        options.onControlAccepted?.(dispatch.request)
      }
      if (buffered && buffered.frame.appliedSequence <= acceptedSequence) {
        const candidate = buffered
        buffered = null
        takeFrame(candidate)
      }
    }
    if (isDisposed || currentEpoch !== epoch) return
    status()
    drain()
    drainNotes()
    settleIdle()
  }
  function connectionFailure(
    request: BackendDocumentRequest | BackendControlRequest
  ): BackendResult {
    return {
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      controlGeneration: request.controlGeneration,
      code: "connection",
    }
  }
  function dispatch(value: Dispatch): void {
    const currentEpoch = epoch
    inFlight = value
    const control = value.kind === "document" ? value.request.state.control : value.request.control
    if (
      !acceptedState ||
      control.seekGeneration !== acceptedState.control.seekGeneration ||
      control.playing !== acceptedState.control.playing ||
      control.recording !== acceptedState.control.recording ||
      control.metronome !== acceptedState.control.metronome
    ) {
      controlSequence = value.request.sequence
    }
    status()
    try {
      const result =
        value.kind === "document" ? backend?.apply(value.request) : backend?.control(value.request)
      if (
        result &&
        typeof result === "object" &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        void result.then(
          valueResult => complete(value, valueResult, currentEpoch),
          () => complete(value, connectionFailure(value.request), currentEpoch)
        )
      } else complete(value, result, currentEpoch)
    } catch {
      complete(value, connectionFailure(value.request), currentEpoch)
    }
  }
  function nextSequence(): number {
    if (sequence === Number.MAX_SAFE_INTEGER) throw new Error("Backend sequence exhausted")
    return ++sequence
  }
  function documentRequest(input: BackendSubmission): BackendDocumentRequest {
    return {
      protocolVersion: 2,
      sessionId,
      sequence: nextSequence(),
      baseRevision: acceptedRevision,
      revision:
        input.stage === "commit" || input.stage === "recover" ? input.revision : acceptedRevision,
      stage: input.stage,
      editId: input.editId,
      controlGeneration: generation.toString(),
      state: { project: input.state.project, control: latestControl ?? input.state.control },
    }
  }
  function drain(): void {
    if (isDraining || isDisposed || inFlight || !backend || (acceptedSequence < 0 && !pendingOpen))
      return
    isDraining = true
    let readmittedOpen = false
    try {
      while (!inFlight) {
        if (!backend || isDisposed) break
        if (pendingOpen) {
          if (readmittedOpen) {
            const currentEpoch = epoch
            queueMicrotask(() => {
              if (currentEpoch === epoch && !isDisposed) drain()
            })
            break
          }
          const opening = pendingOpen
          pendingOpen = null
          pendingControl = false
          readmittedOpen = true
          dispatch({
            kind: "document",
            request: {
              protocolVersion: 2,
              sessionId,
              sequence: nextSequence(),
              baseRevision: 0,
              revision: 0,
              stage: "open",
              editId: null,
              controlGeneration: generation.toString(),
              state: { project: opening.project, control: latestControl ?? opening.control },
            },
          })
          continue
        }
        if (acceptedSequence < 0) break
        const barrier = queue[0]?.stage === "recover"
        if (pendingControl && latestControl && !barrier && (controlMayJump || !queue.length)) {
          pendingControl = false
          controlMayJump = false
          dispatch({
            kind: "control",
            request: {
              protocolVersion: 2,
              sessionId,
              sequence: nextSequence(),
              controlGeneration: generation.toString(),
              control: latestControl,
            },
          })
        } else {
          const input = queue.shift()
          if (!input) break
          // Every document carries the latest control, so a waiting slot is already satisfied.
          pendingControl = false
          controlMayJump = true
          dispatch({ kind: "document", request: documentRequest(input) })
        }
      }
    } finally {
      isDraining = false
      settleIdle()
    }
  }
  function noteFailure(code: BackendFailureCode | "note-overrun"): void {
    clearNotes()
    isFailed = true
    error = code
    panicNotes()
    options.onNoteRejected?.(code)
    status()
    settleIdle()
  }
  function completeNote(
    request: BackendNoteRequest,
    result: unknown,
    currentEpoch: number,
    currentNoteEpoch: number
  ): void {
    if (
      isDisposed ||
      currentEpoch !== epoch ||
      currentNoteEpoch !== noteEpoch ||
      noteInFlight !== request
    )
      return
    noteInFlight = null
    if (
      !validNoteResult(result) ||
      result.sessionId !== sessionId ||
      result.sequence !== request.sequence
    ) {
      noteFailure("protocol")
    } else if (result.kind === "rejected") noteFailure(result.code)
    else {
      status()
      drainNotes()
      settleIdle()
    }
  }
  function drainNotes(): void {
    if (
      drainingNotes ||
      noteInFlight ||
      panickingNotes ||
      !backend ||
      isDisposed ||
      acceptedSequence < 0 ||
      queue.some(input => input.stage === "recover") ||
      (inFlight?.kind === "document" && inFlight.request.stage === "recover")
    )
      return
    drainingNotes = true
    try {
      while (!noteInFlight && notes.length) {
        if (
          !backend ||
          isDisposed ||
          panickingNotes ||
          acceptedSequence < 0 ||
          queue.some(input => input.stage === "recover") ||
          (inFlight?.kind === "document" && inFlight.request.stage === "recover")
        )
          break
        const note = notes.shift()
        if (!note) break
        if (noteSequence === Number.MAX_SAFE_INTEGER) {
          noteFailure("protocol")
          break
        }
        const request: BackendNoteRequest = {
          protocolVersion: 2,
          sessionId,
          sequence: ++noteSequence,
          note,
        }
        const currentEpoch = epoch
        const currentNoteEpoch = noteEpoch
        noteInFlight = request
        status()
        const fail = (): BackendNoteResult => ({
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "connection",
        })
        try {
          const result = backend.note(request)
          if (
            result &&
            typeof result === "object" &&
            "then" in result &&
            typeof result.then === "function"
          ) {
            void result.then(
              value => completeNote(request, value, currentEpoch, currentNoteEpoch),
              () => completeNote(request, fail(), currentEpoch, currentNoteEpoch)
            )
          } else completeNote(request, result, currentEpoch, currentNoteEpoch)
        } catch {
          completeNote(request, fail(), currentEpoch, currentNoteEpoch)
        }
      }
    } finally {
      drainingNotes = false
    }
  }

  return {
    open(nextSessionId, state) {
      if (isDisposed) return
      const beforeOpenControl = !sessionId ? latestControl : null
      epoch++
      for (const waiter of waiters.splice(0)) waiter.resolve(false)
      clearBackend()
      clearNotes()
      panickingNotes = false
      sessionId = nextSessionId
      sequence = -1
      ticket = 0
      noteSequence = 0
      acceptedSequence = -1
      acceptedRevision = 0
      acceptedGeneration = 0n
      controlSequence = 0
      generation = 0n
      latestControl = { ...(beforeOpenControl ?? state.control) }
      pendingControl = false
      controlMayJump = true
      acceptedState = null
      inFlight = null
      queue = []
      pendingOpen = null
      frame = null
      buffered = null
      error = null
      isFailed = false
      const request: BackendDocumentRequest = {
        protocolVersion: 2,
        sessionId,
        sequence: nextSequence(),
        baseRevision: 0,
        revision: 0,
        stage: "open",
        editId: null,
        controlGeneration: generation.toString(),
        state: { project: state.project, control: latestControl },
      }
      try {
        backend = options.factory()
      } catch {
        backend = null
      }
      const value: Dispatch = { kind: "document", request }
      if (backend) {
        dispatch(value)
        subscribe()
      } else {
        inFlight = value
        complete(value, connectionFailure(request), epoch)
      }
    },
    submit(input) {
      if (isDisposed) return -1
      const nextTicket = ++ticket
      updateControl(input.state.control)
      if (!backend) {
        reject({ kind: "document", request: documentRequest(input) }, "connection")
        status()
        settleIdle()
        return nextTicket
      }
      // Only the suffix after the last transaction boundary may lose unsent previews.
      if (input.stage === "preview" || input.stage === "cancel") {
        let start = queue.length
        while (start > 0 && queue[start - 1]?.stage === "preview") start--
        queue = queue.filter((pending, index) => index < start || pending.editId !== input.editId)
      }
      queue.push(input)
      status()
      drain()
      return nextTicket
    },
    submitControl(control) {
      if (isDisposed) return
      updateControl(control)
      pendingControl = true
      status()
      drain()
    },
    submitNote(note) {
      if (isDisposed) return
      if (notes.length + Number(noteInFlight !== null) >= NOTE_CAPACITY) {
        noteFailure("note-overrun")
        return
      }
      notes.push({ ...note })
      status()
      drainNotes()
    },
    start() {
      if (isDisposed) return () => {}
      leases++
      subscribe()
      let isReleased = false
      return () => {
        if (isReleased) return
        isReleased = true
        leases--
        if (leases) return
        unsubscribe?.()
        unsubscribe = null
        frame = null
        buffered = null
      }
    },
    readTelemetry: () =>
      !leases ||
      !frame ||
      !acceptedState ||
      frame.frame.appliedSequence < controlSequence ||
      BigInt(frame.frame.controlGeneration) < generation
        ? null
        : interpolate(
            frame.frame,
            frame.receivedAt,
            acceptedState,
            performance.now(),
            frame.correction
          ),
    readMeters: () => backend?.readMeters?.() ?? null,
    whenIdle() {
      if (isDisposed || !backend) return Promise.resolve(false)
      if (!pending()) return Promise.resolve(!isFailed)
      return new Promise<boolean>(resolve => {
        waiters.push({ epoch, resolve })
      })
    },
    dispose() {
      if (isDisposed) return
      isDisposed = true
      epoch++
      for (const waiter of waiters.splice(0)) waiter.resolve(false)
      queue = []
      pendingOpen = null
      pendingControl = false
      inFlight = null
      clearNotes()
      panickingNotes = false
      frame = null
      buffered = null
      clearBackend()
      leases = 0
    },
  }
}
