import { ZodError } from "zod"
import {
  audioErrorMessage,
  nativeAudio,
  publishNativeAudioStatus,
  type NativeAudioPort,
  type NativeRecording,
} from "@/shared/native/audio"
import type {
  BackendDocumentRequest,
  BackendSource,
  BackendControlRequest,
  BackendNoteRequest,
  BackendNoteResult,
  BackendResult,
  BackendTelemetry,
  ProjectBackend,
} from "@zoeydaw/project-core/backend"
import type { BrowserAuditionPort } from "../browser/controller"
import { resolveBackendSources, resolveBackendDevices } from "./source-locations"
import { prepareNativeWaveforms } from "./waveforms"

export interface NativeProjectBackend extends ProjectBackend {
  urgentStop(): Promise<void>
}

export interface NativeRecordingReceipt {
  sessionId: string
  revision: number
}

export interface NativeProjectBackendOptions {
  commitRecording?(recording: NativeRecording): Promise<NativeRecordingReceipt>
}

export function createNativeProjectBackend(
  port: NativeAudioPort = nativeAudio,
  options: NativeProjectBackendOptions = {}
): NativeProjectBackend {
  const leaseId = crypto.randomUUID()
  const listeners = new Set<(telemetry: BackendTelemetry) => void>()
  const pending = new Set<Promise<unknown>>()
  let disposed = false
  let leased = false
  let sessionId = ""
  let stopToken = 0
  let maxDispatchedNoteSequence = 0
  let admission: Promise<void> | null = null
  let stopBarrier: Promise<void> | null = null
  let timer: number | undefined
  let polling = false
  let pollGeneration = 0
  let lastTelemetrySequence = -1
  const publishingRecordings = new Set<string>()
  const recordingReceipts = new Map<string, NativeRecordingReceipt>()
  const acknowledgedRecordings = new Set<string>()

  function ownsRecording(recordingSession: string): boolean {
    return !disposed && leased && sessionId === recordingSession
  }

  async function publishRecording(recording: NativeRecording): Promise<void> {
    const commitRecording = options.commitRecording
    if (
      !commitRecording ||
      !ownsRecording(recording.sessionId) ||
      publishingRecordings.has(recording.recordingId) ||
      acknowledgedRecordings.has(recording.recordingId)
    )
      return
    publishingRecordings.add(recording.recordingId)
    try {
      let receipt = recordingReceipts.get(recording.recordingId)
      if (!receipt) {
        receipt = await commitRecording(recording)
        if (
          receipt.sessionId !== recording.sessionId ||
          !Number.isSafeInteger(receipt.revision) ||
          receipt.revision < 0
        ) {
          throw new Error("Recording commit returned an invalid native acceptance receipt")
        }
        recordingReceipts.set(recording.recordingId, receipt)
      }
      if (!ownsRecording(recording.sessionId)) return
      await port.recordingAck(leaseId, recording.sessionId, recording.recordingId, receipt.revision)
      acknowledgedRecordings.add(recording.recordingId)
    } catch (error) {
      if (ownsRecording(recording.sessionId))
        publishNativeAudioStatus({ error: audioErrorMessage(error) })
    } finally {
      publishingRecordings.delete(recording.recordingId)
    }
  }

  async function pollRecordings(generation: number): Promise<void> {
    if (!options.commitRecording) return
    const recordingSession = sessionId
    try {
      const result = await port.recordingResults(leaseId, recordingSession)
      if (!ownsRecording(recordingSession) || generation !== pollGeneration) return
      if (
        result.sessionId !== recordingSession ||
        result.recordings.some(recording => recording.sessionId !== recordingSession)
      ) {
        throw new Error("Native recording result belongs to a different session")
      }
      for (const recording of result.recordings) void publishRecording(recording)
    } catch (error) {
      if (ownsRecording(recordingSession) && generation === pollGeneration)
        publishNativeAudioStatus({ error: audioErrorMessage(error) })
    }
  }

  function schedulePoll() {
    if (disposed || !leased || listeners.size === 0 || polling || timer !== undefined) return
    const generation = pollGeneration
    timer = window.setTimeout(async () => {
      timer = undefined
      if (disposed || listeners.size === 0 || generation !== pollGeneration) return
      polling = true
      const recordings = pollRecordings(generation)
      try {
        const snapshot = await port.telemetry(leaseId)
        if (disposed || listeners.size === 0 || generation !== pollGeneration) return
        publishNativeAudioStatus({ device: snapshot.device, issues: snapshot.issues, error: null })
        const telemetry = snapshot.telemetry
        if (
          telemetry &&
          telemetry.sessionId === sessionId &&
          telemetry.sequence > lastTelemetrySequence
        ) {
          lastTelemetrySequence = telemetry.sequence
          for (const listener of listeners) listener(telemetry)
        }
      } catch (error) {
        if (!disposed && generation === pollGeneration)
          publishNativeAudioStatus({ error: audioErrorMessage(error) })
      } finally {
        await recordings
        polling = false
        schedulePoll()
      }
    }, 1000 / 30)
  }
  function cancelPoll() {
    ++pollGeneration
    window.clearTimeout(timer)
    timer = undefined
  }
  function acquireSession(): Promise<void> {
    if (admission) return admission
    const operation = port.acquire(leaseId, sessionId)
    admission = operation
    pending.add(operation)
    void operation
      .then(() => {
        pending.delete(operation)
      })
      .catch(() => {
        pending.delete(operation)
        if (admission === operation) admission = null
      })
    return operation
  }

  function urgentStop(): Promise<void> {
    const token = ++stopToken
    if (!leased || !sessionId) return Promise.resolve()
    const stoppingSession = sessionId
    const operation = (async () => {
      await acquireSession()
      await port.stop(leaseId, stoppingSession, token)
    })()
    stopBarrier = operation
    pending.add(operation)
    void operation
      .then(() => {
        pending.delete(operation)
      })
      .catch(() => {
        pending.delete(operation)
      })
    return operation
  }
  async function control(request: BackendControlRequest): Promise<BackendResult> {
    const reject = (code: "disposed" | "connection" | "protocol" | "rejected"): BackendResult => ({
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      controlGeneration: request.controlGeneration,
      code,
    })
    if (disposed) return reject("disposed")
    if (!port.available()) return reject("connection")
    if (!leased || sessionId !== request.sessionId) return reject("protocol")
    const token = stopToken
    const barrier = stopBarrier
    const operation = (async (): Promise<BackendResult> => {
      await acquireSession()
      if (barrier) await barrier
      if (disposed) return reject("disposed")
      if (token !== stopToken || request.sessionId !== sessionId) return reject("rejected")
      return port.control(request, leaseId, token)
    })()
    pending.add(operation)
    try {
      const result = await operation
      if (disposed) return reject("disposed")
      if (
        result.sessionId !== request.sessionId ||
        result.sequence !== request.sequence ||
        BigInt(result.controlGeneration) < BigInt(request.controlGeneration)
      )
        return reject("protocol")
      if (result.kind === "rejected")
        publishNativeAudioStatus({ error: `Native audio request rejected: ${result.code}` })
      schedulePoll()
      return result
    } catch (error) {
      if (!disposed) publishNativeAudioStatus({ error: audioErrorMessage(error) })
      return reject(disposed ? "disposed" : error instanceof ZodError ? "protocol" : "connection")
    } finally {
      pending.delete(operation)
    }
  }
  async function note(request: BackendNoteRequest): Promise<BackendNoteResult> {
    const reject = (
      code: "disposed" | "connection" | "protocol" | "rejected"
    ): BackendNoteResult => ({
      kind: "rejected",
      sessionId: request.sessionId,
      sequence: request.sequence,
      code,
    })
    if (disposed) return reject("disposed")
    if (!port.available()) return reject("connection")
    if (!leased || sessionId !== request.sessionId) return reject("protocol")
    if (!Number.isSafeInteger(request.sequence) || request.sequence < 1) return reject("protocol")
    maxDispatchedNoteSequence = Math.max(maxDispatchedNoteSequence, request.sequence)
    const token = stopToken
    const barrier = stopBarrier
    const operation = (async (): Promise<BackendNoteResult> => {
      await acquireSession()
      if (barrier) await barrier
      if (disposed) return reject("disposed")
      if (token !== stopToken || request.sessionId !== sessionId) return reject("rejected")
      return port.note(request, leaseId, token)
    })()
    pending.add(operation)
    try {
      const result = await operation
      if (disposed) return reject("disposed")
      if (result.sessionId !== request.sessionId || result.sequence !== request.sequence)
        return reject("protocol")
      if (result.kind === "rejected")
        publishNativeAudioStatus({ error: `Native audio note rejected: ${result.code}` })
      return result
    } catch (error) {
      if (!disposed) publishNativeAudioStatus({ error: audioErrorMessage(error) })
      return reject(disposed ? "disposed" : error instanceof ZodError ? "protocol" : "connection")
    } finally {
      pending.delete(operation)
    }
  }

  async function allNotesOff(): Promise<void> {
    if (disposed || !leased || !sessionId) return
    const panicSession = sessionId
    const throughSequence = maxDispatchedNoteSequence
    const operation = acquireSession().then(() =>
      port.allNotesOff(leaseId, panicSession, throughSequence)
    )
    pending.add(operation)
    try {
      await operation
    } catch (error) {
      if (!disposed) publishNativeAudioStatus({ error: audioErrorMessage(error) })
      throw error
    } finally {
      pending.delete(operation)
    }
  }

  return {
    urgentStop,
    control,
    note,
    allNotesOff,
    async apply(request: BackendDocumentRequest) {
      if (disposed)
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "disposed",
          controlGeneration: request.controlGeneration,
        }
      if (!port.available()) {
        publishNativeAudioStatus({
          error: "Native audio playback is unavailable in the web browser",
        })
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "connection",
          controlGeneration: request.controlGeneration,
        }
      }
      if (
        (sessionId && sessionId !== request.sessionId) ||
        (!sessionId && request.stage !== "open")
      )
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          controlGeneration: request.controlGeneration,
          code: "protocol",
        }
      if (sessionId !== request.sessionId) {
        sessionId = request.sessionId
        admission = null
        maxDispatchedNoteSequence = 0
        lastTelemetrySequence = -1
        cancelPoll()
      }
      leased = true
      const token = stopToken
      const barrier = stopBarrier
      let sources: readonly BackendSource[] | null = null
      const operation = (async (): Promise<BackendResult> => {
        await acquireSession()
        if (barrier) await barrier
        if (disposed || token !== stopToken)
          return {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            controlGeneration: request.controlGeneration,
            code: disposed ? "disposed" : request.stage === "open" ? "superseded-open" : "rejected",
          }
        sources = resolveBackendSources(request.state.project.sources)
        return port.apply(
          {
            ...request,
            state: {
              ...request.state,
              project: {
                ...request.state.project,
                sources,
                tracks: request.state.project.tracks.map(track => ({
                  ...track,
                  devices: resolveBackendDevices(track.devices),
                })),
              },
            },
          },
          leaseId,
          token
        )
      })()
      pending.add(operation)
      try {
        const result: BackendResult = await operation
        if (disposed)
          return {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            code: "disposed",
            controlGeneration: request.controlGeneration,
          }
        if (
          result.sessionId !== request.sessionId ||
          result.sequence !== request.sequence ||
          BigInt(result.controlGeneration) < BigInt(request.controlGeneration)
        )
          return {
            kind: "rejected",
            sessionId: request.sessionId,
            sequence: request.sequence,
            controlGeneration: request.controlGeneration,
            code: "protocol",
          }
        if (result.kind === "rejected" && result.code === "superseded-open") return result
        if (result.kind === "rejected")
          publishNativeAudioStatus({ error: `Native audio request rejected: ${result.code}` })
        if (result.kind === "accepted" && sources) void prepareNativeWaveforms(sources)
        schedulePoll()
        return result
      } catch (error) {
        if (!disposed) publishNativeAudioStatus({ error: audioErrorMessage(error) })
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: disposed ? "disposed" : error instanceof ZodError ? "protocol" : "connection",
          controlGeneration: request.controlGeneration,
        }
      } finally {
        pending.delete(operation)
      }
    },
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      schedulePoll()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) cancelPoll()
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelPoll()
      listeners.clear()
      if (!leased) return
      void urgentStop().catch(error =>
        publishNativeAudioStatus({ error: audioErrorMessage(error) })
      )
      void Promise.allSettled([...pending])
        .then(() => port.release(leaseId))
        .catch(error => {
          publishNativeAudioStatus({ error: audioErrorMessage(error) })
        })
    },
  }
}

interface AuditionSelection {
  token: object
  reservation: Promise<number>
  generation: number | null
}
const auditionState: { selection: object | null; pendingStop: Promise<void> | null } = {
  selection: null,
  pendingStop: null,
}
function auditionSuperseded() {
  return new DOMException("Audition selection superseded", "AbortError")
}
export function createNativeBrowserAuditionPort(
  port: NativeAudioPort = nativeAudio
): BrowserAuditionPort {
  const owner: { selection: AuditionSelection | null; ready: boolean; operation: number } = {
    selection: null,
    ready: false,
    operation: 0,
  }
  const isCurrent = (state: typeof owner, token: object, currentOperation: number) =>
    token === auditionState.selection &&
    token === state.selection?.token &&
    state.operation === currentOperation
  return {
    async select(path) {
      const token = {}
      const currentOperation = ++owner.operation
      auditionState.selection = token
      const previousStop = auditionState.pendingStop
      const reservation = previousStop
        ? previousStop.then(() => {
            if (!isCurrent(owner, token, currentOperation)) throw auditionSuperseded()
            return port.reserveAudition()
          })
        : port.reserveAudition()
      const selected: AuditionSelection = { token, reservation, generation: null }
      owner.selection = selected
      owner.ready = false
      try {
        const generation = await reservation
        if (!isCurrent(owner, token, currentOperation)) throw auditionSuperseded()
        selected.generation = generation
        const result = await port.audition({
          generation,
          path,
          mode: "raw",
          gainDb: -18,
        })
        if (!isCurrent(owner, token, currentOperation) || result.generation !== generation)
          throw auditionSuperseded()
        owner.ready = true
        return { durationSeconds: result.durationSeconds }
      } catch (error) {
        if (isCurrent(owner, token, currentOperation)) {
          owner.selection = null
          owner.ready = false
        }
        throw error
      }
    },
    async stop() {
      const currentOperation = ++owner.operation
      const selected = owner.selection
      if (!selected || !isCurrent(owner, selected.token, currentOperation)) {
        owner.selection = null
        owner.ready = false
        return
      }
      if (owner.ready && selected.generation !== null) {
        await port.stopAudition(selected.generation)
        return
      }
      const previousStop = auditionState.pendingStop
      const stopping = (async () => {
        if (previousStop) await previousStop
        await selected.reservation.catch(() => {})
        if (!isCurrent(owner, selected.token, currentOperation)) return
        const generation = await port.reserveAudition()
        if (!isCurrent(owner, selected.token, currentOperation)) return
        await port.stopAudition(generation)
      })()
      const barrier = stopping.catch(() => {})
      auditionState.pendingStop = barrier
      try {
        await stopping
      } finally {
        if (auditionState.pendingStop === barrier) auditionState.pendingStop = null
        if (isCurrent(owner, selected.token, currentOperation)) {
          owner.selection = null
          owner.ready = false
        }
      }
    },
    async seek(normalized) {
      const generation = owner.selection?.generation
      if (!owner.ready || generation == null || owner.selection?.token !== auditionState.selection)
        throw new Error("Select a preview source before seeking")
      ++owner.operation
      await port.seekAudition(generation, Math.max(0, Math.min(1, normalized)))
    },
    async read() {
      const selected = owner.selection
      if (!owner.ready || !selected || selected.generation === null)
        return { positionSeconds: 0, durationSeconds: 0, playing: false }
      const generation = selected.generation
      if (selected.token !== auditionState.selection) throw auditionSuperseded()
      const currentOperation = owner.operation
      const result = await port.auditionStatus(generation)
      if (!isCurrent(owner, selected.token, currentOperation) || result.generation !== generation)
        throw auditionSuperseded()
      return {
        positionSeconds: result.positionSeconds,
        durationSeconds: result.durationSeconds,
        playing: result.playing,
      }
    },
  }
}
