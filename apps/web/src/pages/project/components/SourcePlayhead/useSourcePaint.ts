import { useEffect, useId, useRef } from "react"
import type { SourcePosition, SourceReference } from "@zoeydaw/project-core/realtime"
import { readProjectSource, watchProjectSources } from "@/pages/project/adapters/realtime"
import { arrangementScheduler } from "@/pages/project/sections/ArrangementPanel/canvas/scheduler"

export function useSourcePaint(
  source: SourceReference | null,
  paint: (element: HTMLSpanElement, position: SourcePosition | null) => void
) {
  const target = useRef<HTMLSpanElement>(null)
  const owner = useId()
  const kind = source?.kind
  const clipId = source?.clipId
  const sourceId = source?.kind === "arrangement" ? source.sourceId : undefined
  useEffect(() => {
    const element = target.current
    if (!element) return
    const reference: SourceReference | null =
      kind === "preview" && clipId
        ? { kind, clipId }
        : kind === "arrangement" && clipId && sourceId
          ? { kind, clipId, sourceId }
          : null
    const update = () => paint(element, reference ? readProjectSource(reference) : null)
    const id = `source-position/${owner}`
    const detachPaint = arrangementScheduler.register(id, update)
    const detachSource = reference
      ? watchProjectSources(id, () => arrangementScheduler.invalidate(id))
      : () => {}
    update()
    return () => {
      detachSource()
      detachPaint()
    }
  }, [kind, clipId, sourceId, paint, owner])
  return target
}
