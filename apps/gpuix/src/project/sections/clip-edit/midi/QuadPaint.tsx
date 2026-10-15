import { memo, useCallback, useLayoutEffect, useMemo } from "react"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import type { QuadBatchController } from "@/shared/quads/useQuadBatch"
import type { PaintLayer } from "./paint-layers"

type PaintBinding = (key: string, batch: QuadBatchController | null) => void

/** The view owns geometry and uploads it without sending buffers or geometry callbacks through nodes. */
export function usePaintLayers(layers: readonly PaintLayer[]): PaintBinding {
  const controllers = useMemo(() => new Map<string, QuadBatchController>(), [])
  const bind = useCallback<PaintBinding>(
    (key, batch) => {
      if (batch) controllers.set(key, batch)
      else controllers.delete(key)
    },
    [controllers]
  )
  useLayoutEffect(() => {
    for (const layer of layers) {
      const controller = controllers.get(layer.key)
      if (!controller) throw new Error(`MIDI paint layer is not mounted: ${layer.key}`)
      controller.setQuads(layer.rectangles())
    }
  }, [controllers, layers])
  return bind
}

export const QuadPaint = memo(function QuadPaint({
  id,
  color,
  opacity,
  width,
  height,
  bind,
}: {
  id: string
  color: string
  opacity: number
  width: number
  height: number
  bind: PaintBinding
}) {
  const batch = useQuadBatch()
  useLayoutEffect(() => {
    bind(id, batch)
    return () => bind(id, null)
  }, [bind, id, batch])
  return (
    <QuadBatch
      ref={batch.ref}
      testId={id}
      style={{ position: "absolute", left: 0, top: 0, width, height, color, opacity }}
    />
  )
})
