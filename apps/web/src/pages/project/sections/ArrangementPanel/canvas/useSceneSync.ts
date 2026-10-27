import { useEffect, useLayoutEffect, useMemo } from "react"
import { getEffectiveDocument, useProjectState } from "@/pages/project/adapters"
import { arrangementViewProjection } from "@/pages/project/layout"
import { arrangementScene } from "./scene"
import { useNativeWaveforms } from "@/pages/project/adapters/backend/waveforms"
import { useWaveformRanges } from "@/pages/project/adapters/backend/waveform-ranges"
import { useArrangementWaveformRanges } from "./waveform-ranges"
import { projectTempoSections } from "@zoeydaw/project-core/tempo-map"

/**
 * Mirror the slice of project state the canvas scene store needs.
 *
 * This is the one place React reads from `useProjectState` for the canvas layer.
 * The canvas painters and scheduler never subscribe to React.
 */
export function useSceneSync(bars: number) {
  const document = useProjectState(s => s.document)
  const preview = useProjectState(s => s.session.preview)
  const waveforms = useNativeWaveforms(state => state.entries)
  const ranges = useWaveformRanges(state => state.entries)
  useArrangementWaveformRanges()
  const effective = useMemo(
    () => getEffectiveDocument({ document, session: { preview } }),
    [document, preview]
  )
  const timeSelection = useProjectState(s => s.session.timeSelection)
  const selectedClipIds = useProjectState(s => s.session.selectedClipIds)
  const selectedTrackIds = useProjectState(s => s.session.selectedTrackIds)
  const automationTargets = useProjectState(s => s.session.automationTargets)
  const automationLanes = useProjectState(s => s.workspace.automationLanes)
  const automationMode = useProjectState(s => s.workspace.automationMode)
  const arrangementView = useProjectState(s => s.workspace.arrangementView)
  const rulerFormat = useProjectState(s => s.workspace.rulerFormat)
  const visualTracks = document.tracks
  const projectedTracks = useMemo(
    () => arrangementViewProjection(visualTracks, arrangementView).tracks,
    [visualTracks, arrangementView]
  )
  const projectedPreview = useMemo(
    () =>
      preview?.kind === "tracks"
        ? { ...preview, tracks: arrangementViewProjection(preview.tracks, arrangementView).tracks }
        : preview,
    [preview, arrangementView]
  )
  const grid = useProjectState(s => s.workspace.grid)
  const playing = useProjectState(s => s.session.playing)
  const insertionPoint = useProjectState(s => s.session.insertionPoint)
  useLayoutEffect(() => {
    arrangementScene.setMusic({
      bars,
      grid,
      transport: {
        bpm: document.transport.bpm,
        numerator: document.transport.numerator,
        denominator: document.transport.denominator,
        tempo: projectTempoSections(effective.tracks, document.transport),
      },
      markers: document.markers,
      loop: document.transport.loop,
      tracks: projectedTracks,
      media: effective.media,
      patterns: effective.patterns,
      rulerFormat,
    })
    arrangementScene.setProjectPreview(projectedPreview)
    if (preview?.kind === "tracks") {
      return
    }

    arrangementScene.setClipDrag(null)
    arrangementScene.setClipResize(null)
  }, [
    document,
    effective,
    preview,
    grid,
    bars,
    projectedTracks,
    projectedPreview,
    rulerFormat,
    waveforms,
    ranges,
  ])
  useLayoutEffect(() => {
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
  useLayoutEffect(() => {
    arrangementScene.setAutomationDisplay(automationTargets, automationLanes, automationMode)
  }, [automationTargets, automationLanes, automationMode])
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
