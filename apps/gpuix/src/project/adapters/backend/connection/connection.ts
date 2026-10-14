import { validResult, validFrame } from "./protocol"
import { interpolate } from "./telemetry"
import type {
  BackendFailureCode,
  BackendRequest,
  BackendResult,
  BackendStage,
  BackendState,
  BackendTelemetry,
  ProjectBackend,
  ProjectBackendFactory,
  ProjectRuntimeStatus,
} from "@/project/model/backend"

export interface BackendSubmission {
  stage: Exclude<BackendStage, "open">
  revision: number
  editId: string | null
  state: BackendState
}

export interface BackendConnectionOptions {
  factory: ProjectBackendFactory
  onAccepted: (request: BackendRequest) => void
  onRejected: (request: BackendRequest, code: BackendFailureCode) => void
  onStatus: (status: ProjectRuntimeStatus) => void
  onTelemetry: (frame: BackendTelemetry) => void
}

export interface BackendConnection {
  open: (sessionId: string, state: BackendState) => void
  submit: (input: BackendSubmission) => number
  start: () => () => void
  readTelemetry: () => BackendTelemetry | null
  whenIdle: () => Promise<boolean>
  dispose: () => void
}

interface Pending {
  sequence: number
  input: BackendSubmission
}
interface InFlight {
  request: BackendRequest
  epoch: number
}
interface IdleWaiter {
  epoch: number
  resolve: (success: boolean) => void
}
interface TimedFrame {
  frame: BackendTelemetry
  receivedAt: number
}

export function createBackendConnection(options: BackendConnectionOptions): BackendConnection {
  let backend: ProjectBackend | null = null
  let unsubscribe: (() => void) | null = null
  let leases = 0
  let epoch = 0
  let sessionId = ""
  let isDisposed = false
  let sequence = 0
  let acceptedSequence = -1
  let acceptedRevision = 0
  let controlSequence = 0
  let acceptedState: BackendState | null = null
  let inFlight: InFlight | null = null
  let queue: Pending[] = []
  let isDraining = false
  let frame: TimedFrame | null = null
  let buffered: TimedFrame | null = null
  let error: BackendFailureCode | null = null
  let isFailed = false
  const waiters: IdleWaiter[] = []

  function status(): void {
    const pending = queue.length + Number(inFlight !== null)
    const phase = error ? "error" : acceptedSequence < 0 ? "opening" : pending ? "pending" : "ready"
    options.onStatus({ phase, sessionId, pending, acceptedRevision, error })
  }

  function settleIdle(): void {
    if (inFlight || queue.length) {
      return
    }
    for (const waiter of waiters.splice(0)) {
      waiter.resolve(waiter.epoch === epoch && !isFailed)
    }
  }

  function takeFrame(candidate: TimedFrame): void {
    if (
      !acceptedState ||
      candidate.frame.appliedSequence > acceptedSequence ||
      candidate.frame.appliedSequence < controlSequence ||
      (frame &&
        (candidate.frame.sequence <= frame.frame.sequence ||
          candidate.frame.appliedSequence < frame.frame.appliedSequence))
    ) {
      return
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
    ) {
      return
    }
    const timed = { frame: candidate, receivedAt: performance.now() }
    if (candidate.appliedSequence === inFlight?.request.sequence) {
      if (!buffered || candidate.sequence >= buffered.frame.sequence) {
        buffered = timed
      }
      return
    }
    if (candidate.appliedSequence > acceptedSequence) {
      return
    }
    takeFrame(timed)
  }

  function subscribe(): void {
    if (!backend || !leases || unsubscribe) {
      return
    }
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

  function rejected(request: BackendRequest, code: BackendFailureCode): void {
    queue = []
    buffered = null
    error = code
    isFailed = true
    options.onRejected(request, code)
  }

  function complete(request: BackendRequest, result: unknown, currentEpoch: number): void {
    if (isDisposed || currentEpoch !== epoch || inFlight?.request !== request) {
      return
    }
    inFlight = null
    if (
      !validResult(result) ||
      result.sessionId !== sessionId ||
      result.sequence !== request.sequence ||
      (result.kind === "accepted" &&
        result.revision !==
          (request.stage === "open" || request.stage === "commit" || request.stage === "recover"
            ? request.revision
            : acceptedRevision))
    ) {
      rejected(request, "protocol")
    } else if (result.kind === "rejected") {
      rejected(request, result.code)
    } else {
      acceptedSequence = request.sequence
      if (request.stage === "open" || request.stage === "commit" || request.stage === "recover") {
        acceptedRevision = request.revision
      }
      acceptedState = request.state
      if (request.stage === "commit") {
        error = null
      }
      if (request.stage === "commit" || request.stage === "recover") {
        isFailed = false
      }
      if (buffered && buffered.frame.appliedSequence <= acceptedSequence) {
        const candidate = buffered
        buffered = null
        takeFrame(candidate)
      }
      options.onAccepted(request)
    }
    if (isDisposed || currentEpoch !== epoch) {
      return
    }
    status()
    drain()
    settleIdle()
  }

  function connectionFailure(request: BackendRequest): BackendResult {
    return {
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      code: "connection",
    }
  }

  function dispatch(request: BackendRequest): void {
    const currentEpoch = epoch
    inFlight = { request, epoch: currentEpoch }
    if (
      request.stage === "open" ||
      request.state.control.seekGeneration !== acceptedState?.control.seekGeneration ||
      request.state.control.playing !== acceptedState?.control.playing
    ) {
      controlSequence = request.sequence
    }
    status()
    try {
      const result = backend?.apply(request)
      if (
        result &&
        typeof result === "object" &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        void result.then(
          accepted => complete(request, accepted, currentEpoch),
          () => complete(request, connectionFailure(request), currentEpoch)
        )
      } else {
        complete(request, result, currentEpoch)
      }
    } catch {
      complete(request, connectionFailure(request), currentEpoch)
    }
  }

  function drain(): void {
    if (isDraining || isDisposed || inFlight || !backend) {
      return
    }
    isDraining = true
    try {
      while (!inFlight && queue.length) {
        if (!backend || isDisposed) {
          break
        }
        const pending = queue.shift()
        if (!pending) {
          break
        }
        const request: BackendRequest = {
          protocolVersion: 1,
          sessionId,
          sequence: pending.sequence,
          baseRevision: acceptedRevision,
          revision:
            pending.input.stage === "commit" || pending.input.stage === "recover"
              ? pending.input.revision
              : acceptedRevision,
          stage: pending.input.stage,
          editId: pending.input.editId,
          state: pending.input.state,
        }
        dispatch(request)
      }
    } finally {
      isDraining = false
      settleIdle()
    }
  }

  return {
    open(nextSessionId, state) {
      if (isDisposed) {
        return
      }
      epoch++
      for (const waiter of waiters.splice(0)) {
        waiter.resolve(false)
      }
      clearBackend()
      sessionId = nextSessionId
      sequence = 0
      acceptedSequence = -1
      acceptedRevision = 0
      controlSequence = 0
      acceptedState = null
      inFlight = null
      queue = []
      frame = null
      buffered = null
      error = null
      isFailed = false
      status()
      const request: BackendRequest = {
        protocolVersion: 1,
        sessionId,
        sequence: 0,
        baseRevision: 0,
        revision: 0,
        stage: "open",
        editId: null,
        state,
      }
      try {
        backend = options.factory()
      } catch {
        backend = null
      }
      if (backend) {
        dispatch(request)
        subscribe()
      } else {
        inFlight = { request, epoch }
        complete(request, connectionFailure(request), epoch)
      }
    },
    submit(input) {
      if (isDisposed) {
        return -1
      }
      const next = ++sequence
      if (!backend) {
        const request: BackendRequest = {
          protocolVersion: 1,
          sessionId,
          sequence: next,
          baseRevision: acceptedRevision,
          revision: input.revision,
          stage: input.stage,
          editId: input.editId,
          state: input.state,
        }
        rejected(request, "connection")
        status()
        settleIdle()
        return next
      }
      if (
        input.state.control.seekGeneration !== acceptedState?.control.seekGeneration ||
        input.state.control.playing !== acceptedState?.control.playing
      ) {
        controlSequence = next
      }
      if (input.stage === "cancel") {
        queue = queue.filter(
          pending => pending.input.stage !== "preview" || pending.input.editId !== input.editId
        )
      }
      if (input.stage === "preview") {
        const index = queue.findIndex(
          pending => pending.input.stage === "preview" && pending.input.editId === input.editId
        )
        if (index !== -1) {
          queue.splice(index, 1)
        }
      }
      queue.push({ input, sequence: next })
      status()
      drain()
      return next
    },
    start() {
      if (isDisposed) {
        return () => {}
      }
      leases++
      subscribe()
      let isReleased = false
      return () => {
        if (isReleased) {
          return
        }
        isReleased = true
        leases--
        if (leases) {
          return
        }

        unsubscribe?.()
        unsubscribe = null
        frame = null
        buffered = null
      }
    },
    readTelemetry: () =>
      !leases || !frame || !acceptedState || frame.frame.appliedSequence < controlSequence
        ? null
        : interpolate(frame.frame, frame.receivedAt, acceptedState, performance.now()),
    whenIdle() {
      if (isDisposed || !backend) {
        return Promise.resolve(false)
      }
      return !inFlight && !queue.length
        ? Promise.resolve(!isFailed)
        : new Promise<boolean>(resolve => {
            waiters.push({ epoch, resolve })
          })
    },
    dispose() {
      if (isDisposed) {
        return
      }
      isDisposed = true
      epoch++
      for (const waiter of waiters.splice(0)) {
        waiter.resolve(false)
      }
      queue = []
      inFlight = null
      frame = null
      buffered = null
      clearBackend()
      leases = 0
    },
  }
}
