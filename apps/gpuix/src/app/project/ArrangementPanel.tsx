import { useSyncExternalStore } from "react"
import { nativeCursorLock } from "@/platform/cursor"
import {
  projectActions,
  readProjectPeaks,
  readProjectTelemetry,
  readTransportBar,
  useProjectState,
} from "@/project/adapters"
import { ArrangementTimeline } from "@/project/sections/arrangement/timeline"
import { LaneRow, LaneOverlay, useLaneSurface } from "@/project/sections/arrangement/lane"
import {
  TrackRows,
  TrackResizeOverlay,
  trackResources,
} from "@/project/sections/arrangement/tracks"
import { useAppTranslation } from "../i18n"
import { englishLabels, chineseLabels } from "../locales/sections/timeline"
import { labelsByLocale } from "../locales/sections/lane"
import type { ProjectComposition } from "./composition"

export function ArrangementPanel({ composition }: { readonly composition: ProjectComposition }) {
  const { timeline, lane } = composition
  const scene = useSyncExternalStore(timeline.sceneStore.subscribe, timeline.sceneStore.get)
  const viewport = timeline.useViewport()
  const { locale } = useAppTranslation()
  const editSurface = useLaneSurface(lane, labelsByLocale[locale === "zh-CN" ? "zh" : "en"])
  const selectedTrackIds = useProjectState(state => state.session.selectedTrackIds)
  const selectionSurface = useProjectState(state => state.session.trackSelectionSurface)
  return (
    <ArrangementTimeline
      controller={timeline}
      editSurface={editSurface}
      labels={locale === "zh-CN" ? chineseLabels : englishLabels}
      cursor={nativeCursorLock}
      tracks={
        <TrackRows
          scene={scene}
          viewport={viewport}
          focusedTrackId={selectionSurface === "header" ? (selectedTrackIds.at(-1) ?? null) : null}
          onFocusTrack={id => projectActions.selectTracks([id], "header")}
          telemetry={readProjectTelemetry}
          labels={trackResources[locale].arrangement}
          renderLane={row => (
            <LaneRow row={row} scene={scene} viewport={viewport} readPeaks={readProjectPeaks} />
          )}
        />
      }
      overlay={<LaneOverlay scene={scene} viewport={viewport} transportBar={readTransportBar} />}
      interactionOverlay={
        <TrackResizeOverlay
          scene={scene}
          viewport={viewport}
          labels={trackResources[locale].arrangement}
        />
      }
    />
  )
}
