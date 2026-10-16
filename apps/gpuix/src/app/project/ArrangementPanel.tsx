import { useMemo, useSyncExternalStore } from "react"
import { useGpuix } from "@gpuix/react"
import { createNativeCursorLock } from "@/platform/cursor"
import {
  projectActions,
  readProjectPeaks,
  readProjectTelemetry,
  readTransportBar,
  useProjectState,
} from "@/project/adapters"
import { ArrangementTimeline } from "@/project/sections/arrangement/timeline"
import { LaneRow, LaneOverlay, useLaneSurface } from "@/project/sections/arrangement/lane"
import { TrackRows, TrackResizeOverlay } from "@/project/sections/arrangement/tracks"
import { useAppTranslation } from "../i18n"
import { englishLabels, chineseLabels } from "../locales/sections/timeline"
import { labelsByLocale } from "../locales/sections/lane"
import { createTrackLabels } from "../locales/sections/tracks"
import type { ProjectComposition } from "./composition"

export function ArrangementPanel({ composition }: { readonly composition: ProjectComposition }) {
  const { timeline, lane } = composition
  const { renderer } = useGpuix()
  const cursor = useMemo(() => createNativeCursorLock(renderer), [renderer])
  const scene = useSyncExternalStore(timeline.sceneStore.subscribe, timeline.sceneStore.get)
  const viewport = timeline.useViewport()
  const { locale } = useAppTranslation()
  const trackLabels = useMemo(() => createTrackLabels(locale), [locale])
  const laneLabels = labelsByLocale[locale === "zh-CN" ? "zh" : "en"]
  const editSurface = useLaneSurface(lane, laneLabels)
  const selectedTrackIds = useProjectState(state => state.session.selectedTrackIds)
  const selectionSurface = useProjectState(state => state.session.trackSelectionSurface)
  return (
    <ArrangementTimeline
      controller={timeline}
      editSurface={editSurface}
      labels={locale === "zh-CN" ? chineseLabels : englishLabels}
      cursor={cursor}
      tracks={
        <TrackRows
          scene={scene}
          viewport={viewport}
          focusedTrackId={selectionSurface === "header" ? (selectedTrackIds.at(-1) ?? null) : null}
          onFocusTrack={id => projectActions.selectTracks([id], "header")}
          telemetry={readProjectTelemetry}
          labels={trackLabels}
          renderLane={row => (
            <LaneRow
              row={row}
              scene={scene}
              viewport={viewport}
              readPeaks={readProjectPeaks}
              creationNames={laneLabels.creationNames}
            />
          )}
        />
      }
      overlay={<LaneOverlay scene={scene} viewport={viewport} transportBar={readTransportBar} />}
      interactionOverlay={
        <TrackResizeOverlay scene={scene} viewport={viewport} labels={trackLabels} />
      }
    />
  )
}
