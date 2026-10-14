import * as engine from "@/platform/engine"
import { validFrame, validResult } from "./connection/protocol"
import type { BackendResult, BackendTelemetry, ProjectBackend } from "../../model/backend"

export interface NativeProjectBackend extends ProjectBackend {
  /** Channel-major, pixel-major [min,max]; stereo returns pixels * 4 floats, never PCM. */
  readPeaks: (
    sourceId: string,
    startFrame: number,
    endFrame: number,
    pixels: number
  ) => Float32Array
}

export function createNativeBackend(): NativeProjectBackend {
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
    readPeaks(sourceId, startFrame, endFrame, pixels) {
      return engine.readPeaks(handle, sourceId, startFrame, endFrame, pixels)
    },
  }
}
