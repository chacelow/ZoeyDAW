import { useEffect, useLayoutEffect, useMemo } from "react"
import { getEffectiveDocument, useProjectState } from "@/pages/project/adapters"
import { growTimelineBars, timelineBars } from "@/pages/project/model/selectors"
import { positionToBar } from "@/pages/project/model/types"
import { arrangementScene } from "./scene"

/**
 * Mirror the slice of project state the canvas scene store needs.
 *
 * This is the one place React reads from `useProjectState` for the canvas layer.
 * The canvas painters and scheduler never subscribe to React.
 */
export function useSceneSync() {
  const document = useProjectState(s => s.document)
  const preview = useProjectState(s => s.session.preview)
  const effective = useMemo(
    () => getEffectiveDocument({ document, session: { preview } }),
    [document, preview]
  )
  const timeSelection = useProjectState(s => s.session.timeSelection)
  const selectedClipIds = useProjectState(s => s.session.selectedClipIds)
  const selectedTrackIds = useProjectState(s => s.session.selectedTrackIds)
  const automationParameters = useProjectState(s => s.session.automationParameters)
  const selectionEnd = timeSelection?.endBar ?? 1
  const position = useProjectState(s =>
    positionToBar(s.session.position, s.document.transport.numerator)
  )
  const grid = useProjectState(s => s.workspace.grid)
  const playing = useProjectState(s => s.session.playing)
  const insertionPoint = useProjectState(s => s.session.insertionPoint)
  useLayoutEffect(() => {
    const bars = growTimelineBars(timelineBars(effective), Math.max(position, selectionEnd))
    arrangementScene.setMusic({
      bars,
      grid,
      transport: {
        bpm: document.transport.bpm,
        numerator: document.transport.numerator,
        denominator: document.transport.denominator,
      },
      markers: document.markers,
      loop: document.transport.loop,
      tracks: document.tracks,
    })
    arrangementScene.setProjectPreview(preview)
    if (preview?.kind === "tracks") {
      return
    }

    arrangementScene.setClipDrag(null)
    arrangementScene.setClipResize(null)
  }, [document, effective, preview, grid, position, selectionEnd])
  useEffect(() => {
    arrangementScene.setPlayback({ playing, insertionPoint })
  }, [playing, insertionPoint])
  useEffect(() => {
    arrangementScene.setSelection(new Set(selectedClipIds))
  }, [selectedClipIds])
  useEffect(() => {
    arrangementScene.setTrackSelection(new Set(selectedTrackIds))
  }, [selectedTrackIds])
  useEffect(() => {
    arrangementScene.setTimeSelection(timeSelection ?? null)
  }, [timeSelection])
  useEffect(() => {
    arrangementScene.setAutomationParameters(automationParameters)
  }, [automationParameters])
}

/**
Push zoom/scroll from the DOM viewport controller into the scene store.
*/
export function useViewportSync(input: { pxPerBar: number; scrollX: number; scrollY: number }) {
  useLayoutEffect(() => {
    const previous = arrangementScene.get().viewport
    arrangementScene.setViewport({
      ...previous,
      pxPerBar: input.pxPerBar,
      scrollX: input.scrollX,
      scrollY: input.scrollY,
    })
  }, [input.pxPerBar, input.scrollX, input.scrollY])
}
