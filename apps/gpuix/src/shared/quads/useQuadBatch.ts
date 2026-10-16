import type { QuadBatchInstance } from "@gpuix/react"
import { useMemo } from "react"

export interface QuadBatchController {
  ref(instance: QuadBatchInstance | null): void
  setQuads(quads: Float32Array): void
}

export function useQuadBatch(): QuadBatchController {
  return useMemo(() => {
    let host: QuadBatchInstance | null = null
    let latest: Float32Array | null = null
    let uploaded: Float32Array | null = null

    const upload = () => {
      if (!host || !latest || latest === uploaded) return
      host.setQuads(latest)
      uploaded = latest
    }

    return {
      ref(instance: QuadBatchInstance | null) {
        if (host === instance) return
        host = instance
        uploaded = null
        upload()
      },
      setQuads(quads: Float32Array) {
        latest = quads
        upload()
      },
    }
  }, [])
}
