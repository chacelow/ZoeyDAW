import * as engine from "@/platform/engine"
import { validFrame, validResult } from "./connection/protocol"
import type { BackendResult, BackendTelemetry, ProjectBackend } from "../../model/backend"

export function createNativeBackend(): ProjectBackend {
  const handle = engine.openSession()
  const listeners = new Set<(telemetry: BackendTelemetry) => void>()
  let disposed = false
  let sessionId = ""
  engine.subscribeTelemetry(handle, json => {
    if (disposed) {
      return
    }
    const value: unknown = JSON.parse(json)
    if (!validFrame(value, sessionId)) {
      return
    }
    for (const listener of listeners) {
      listener(value)
    }
  })
  return {
    apply(request): BackendResult {
      if (disposed) {
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "disposed",
        }
      }
      const result: unknown = JSON.parse(engine.apply(handle, JSON.stringify(request)))
      if (!validResult(result)) {
        return {
          kind: "rejected",
          sessionId: request.sessionId,
          sequence: request.sequence,
          code: "protocol",
        }
      }
      if (result.kind === "accepted") {
        sessionId = result.sessionId
      }
      return result
    },
    subscribe(listener) {
      if (disposed) {
        return () => {}
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      listeners.clear()
      engine.dispose(handle)
    },
    readPeaks(sourceId, startBar, endBar, pixels, contentOffsetBars) {
      if (disposed) {
        return new Float32Array(0)
      }
      return engine.readPeaksAtBars(handle, sourceId, startBar, endBar, pixels, contentOffsetBars)
    },
  }
}
