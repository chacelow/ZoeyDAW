import { useTranslation } from "@zoeymind/i18n"
import { InsertTrackMenu } from "./InsertTrackMenu"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { visibleTracks } from "@zoeydaw/project-core/types"
import { snapBar } from "@/pages/project/sections/ArrangementPanel/Grid/geometry"
import { arrangementScene } from "../canvas/scene"
import { TRACK_DROP_ZONE_HEIGHT, isPinnedTrack } from "../canvas/layout"

/**
Empty area after the last track inside the scrolling lane stack. It is part of
the scroll content, so it only becomes visible once every track has scrolled
past, and it keeps the load hint plus the insert-track menu.

The zone is clipped to the scrollable strip: it must never paint over the
pinned Return/Main tracks or the bottom time ruler.
*/
export function TrackDropZone({
  top,
  clipTop,
  clipBottom,
}: {
  readonly top: number
  readonly clipTop: number
  readonly clipBottom: number
}) {
  const { t } = useTranslation()
  return (
    <div
      className="pointer-events-none absolute inset-x-0 overflow-hidden"
      style={{ top: clipTop, height: Math.max(0, clipBottom - clipTop) }}
    >
      <div className="pointer-events-auto absolute inset-x-0" style={{ top: top - clipTop }}>
        <InsertTrackMenu>
          <div
            data-arrangement-drop-zone
            className="text-muted-foreground flex items-center justify-center text-[10px] select-none"
            style={{ height: TRACK_DROP_ZONE_HEIGHT }}
            onPointerDown={event => {
              if (event.button !== 0) {
                return
              }
              // The zone sits above the canvas, so the canvas gesture layer
              // never sees this press. Handle it here and stop it from
              // bubbling, otherwise the canvas clears the selection again.
              event.stopPropagation()
              const state = useProjectState.getState()
              const trailing = visibleTracks(state.document.tracks)
                .filter(track => !isPinnedTrack(track))
                .at(-1)
              if (!trailing) {
                return
              }
              const { viewport, gridPlan, bars } = arrangementScene.get()
              const bounds = event.currentTarget.getBoundingClientRect()
              const bar = snapBar(
                1 + (event.clientX - bounds.left + viewport.scrollX) / viewport.pxPerBar,
                state.workspace.snap,
                gridPlan.cellBars,
                bars + 1
              )
              // The empty area belongs to no row of its own, so the cursor
              // lands in the last scrollable track instead of disappearing.
              projectActions.selectTracks([trailing.id], "arrangement")
              projectActions.setTimeSelection(null)
              projectActions.setInsertionPoint({ trackId: trailing.id, bar })
              arrangementScene.setTimeSelection(null)
              arrangementScene.setSelection(new Set())
            }}
          >
            <span className="pointer-events-none">{t("arrangement.loadFilesAndDevices")}</span>
          </div>
        </InsertTrackMenu>
      </div>
    </div>
  )
}
