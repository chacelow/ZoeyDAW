import { isOrdinaryTrack } from "@zoeydaw/project-core/reducers"
import type { BackendDocumentRequest } from "@zoeydaw/project-core/backend"
import type { DocumentState } from "@zoeydaw/project-core/types"

export type RecordingReceipt = Pick<BackendDocumentRequest, "sessionId" | "revision">
export type RecordingBackendConfirmation =
  | { kind: "unavailable" }
  | { kind: "pending" }
  | { kind: "ready"; document: DocumentState; receipt: RecordingReceipt | null }
interface RecordingEntry {
  apply: (document: DocumentState) => DocumentState
  epoch: string
  revision: number | null
  receipt: {
    settled: boolean
    resolve: (value: RecordingReceipt) => void
    reject: (error: unknown) => void
  } | null
}
interface RecordingPublicationDependencies {
  document(): DocumentState
  epoch(): string
  blocked(): boolean
  backend(): RecordingBackendConfirmation
  publish(document: DocumentState): void
}
export interface RecordingPublication {
  submitted(revision: number): void
  accepted(receipt: RecordingReceipt): void
  beginRecovery(): ((document: DocumentState) => DocumentState) | null
  rejectRecovery(error: Error): void
  rejectReceipts(error: Error): void
  clear(): void
  flush(): void
  recordDocument(apply: (document: DocumentState) => DocumentState): void
  recordDocumentConfirmed(
    apply: (document: DocumentState) => DocumentState,
    expectedEpoch: string
  ): Promise<RecordingReceipt>
}

export function createRecordingPublication(
  options: RecordingPublicationDependencies
): RecordingPublication {
  let journal: RecordingEntry[] = []
  let pending: RecordingEntry[] = []
  function resolveRecording(entry: RecordingEntry, value: RecordingReceipt): void {
    if (!entry.receipt || entry.receipt.settled) return
    entry.receipt.settled = true
    entry.receipt.resolve(value)
  }
  function rejectRecording(entry: RecordingEntry, error: unknown): void {
    if (!entry.receipt || entry.receipt.settled) return
    entry.receipt.settled = true
    entry.receipt.reject(error)
  }
  function rejectReceipts(error: Error): void {
    for (const entry of journal) rejectRecording(entry, error)
    for (const entry of pending) rejectRecording(entry, error)
  }
  function flush(): void {
    if (options.blocked()) return
    while (journal.length) {
      const entry = journal.shift()
      if (entry) applyRecording(entry)
    }
  }
  function applyRecording(entry: RecordingEntry): void {
    if (entry.epoch !== options.epoch()) {
      rejectRecording(entry, new Error("Project changed before recording publication"))
      return
    }
    try {
      const current = options.document()
      const next = entry.apply(current)
      if (!next.tracks.some(isOrdinaryTrack)) {
        if (!entry.receipt) return
        throw new Error("Recorded document must retain an ordinary track")
      }
      if (next === current) {
        if (!entry.receipt) return
        const backend = options.backend()
        if (backend.kind === "ready" && backend.receipt && next === backend.document) {
          resolveRecording(entry, backend.receipt)
          return
        }
      }
      pending.push(entry)
      options.publish(next)
    } catch (error) {
      pending = pending.filter(value => value !== entry)
      if (!entry.receipt) throw error
      rejectRecording(entry, error)
    }
  }
  function queueRecording(entry: RecordingEntry): void {
    if (options.blocked()) journal.push(entry)
    else applyRecording(entry)
  }
  return {
    submitted(revision) {
      for (const entry of pending) if (entry.revision === null) entry.revision = revision
    },
    accepted(receipt) {
      pending = pending.filter(entry => {
        if (entry.revision === null || entry.revision > receipt.revision) return true
        if (entry.epoch !== options.epoch()) {
          rejectRecording(entry, new Error("Project changed before recording was accepted"))
        } else resolveRecording(entry, receipt)
        return false
      })
    },
    beginRecovery() {
      const unreconciled = pending
      pending = []
      if (!unreconciled.length) return null
      return document => {
        let recovered = document
        for (const entry of unreconciled) {
          if (entry.epoch !== options.epoch()) {
            rejectRecording(entry, new Error("Project changed before recording recovery"))
            continue
          }
          try {
            const next = entry.apply(recovered)
            if (!next.tracks.some(isOrdinaryTrack))
              throw new Error("Recorded document must retain an ordinary track")
            recovered = next
            entry.revision = null
            pending.push(entry)
          } catch (error) {
            if (!entry.receipt) throw error
            rejectRecording(entry, error)
          }
        }
        return recovered
      }
    },
    rejectRecovery(error) {
      rejectReceipts(error)
      pending = []
      journal = journal.filter(entry => entry.receipt === null)
    },
    rejectReceipts,
    clear() {
      journal = []
      pending = []
    },
    flush,
    recordDocument(apply) {
      queueRecording({ apply, epoch: options.epoch(), revision: null, receipt: null })
    },
    recordDocumentConfirmed(apply, expectedEpoch) {
      const { promise, resolve, reject } = Promise.withResolvers<RecordingReceipt>()
      if (expectedEpoch !== options.epoch()) {
        reject(new Error("Project changed before recording publication"))
      } else if (options.backend().kind === "unavailable") {
        reject(new Error("Project backend is unavailable for recording publication"))
      } else {
        queueRecording({
          apply,
          epoch: expectedEpoch,
          revision: null,
          receipt: { settled: false, resolve, reject },
        })
      }
      return promise
    },
  }
}
