import { useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "@/project/adapters"
import { visibleTracks } from "@/project/model/types"
import { useTrackLabels } from "../labels"
import { TrackIdentity } from "../TrackIdentity"
import { TrackRouting } from "../TrackRouting"
import { TrackMixer } from "../TrackMixer"
import { TrackMenu } from "../TrackMenu"
import type { ReactNode } from "react"
import type { Props } from "@gpuix/react"
import type { GroupRail } from "@/project/model/track-groups"
import type { TrackRow as TrackRowGeometry } from "../../core/layout"

export function TrackRow({
  row,
  rails,
  lane,
  showLane,
  onFocusTrack,
  dragHandlers,
  dragging,
  dropTarget,
}: {
  readonly row: TrackRowGeometry
  readonly rails: readonly GroupRail[]
  readonly lane: ReactNode
  readonly showLane: boolean
  readonly onFocusTrack: (id: string) => void
  readonly dragHandlers?: Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown">
  readonly dragging: boolean
  readonly dropTarget: boolean
}) {
  const { track } = row
  const theme = useTheme()
  const { t } = useTrackLabels()
  const selection = useProjectState(state => state.session.selectedTrackIds)
  const surface = useProjectState(state => state.session.trackSelectionSurface)
  const selected = selection.includes(track.id)
  const [renaming, setRenaming] = useState(false)
  const choose = (target: "arrangement" | "header", range: boolean, additive: boolean) => {
    if (range && selection.length) {
      const ids = visibleTracks(useProjectState.getState().document.tracks).map(item => item.id)
      const start = ids.indexOf(selection[0] ?? "")
      const end = ids.indexOf(track.id)
      if (start !== -1 && end !== -1) {
        projectActions.selectTracks(
          ids.slice(Math.min(start, end), Math.max(start, end) + 1),
          target
        )
        return
      }
    }
    projectActions.selectTracks(
      additive
        ? selected
          ? selection.filter(id => id !== track.id)
          : [...selection, track.id]
        : [track.id],
      target
    )
  }
  const focusRing = {
    outlineWidth: theme.design.shape.focusRingWidth,
    outlineOffset: -theme.design.shape.focusRingWidth,
    outlineColor: theme.colors.ring,
  }
  return (
    <TrackMenu
      track={track}
      onRename={() => {
        onFocusTrack(track.id)
        setRenaming(true)
      }}
    >
      <div
        role="group"
        aria-label={track.name}
        testId={`track-row-${track.id}`}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: row.height,
          borderTopWidth: row.trackGeometry.border / 2,
          borderBottomWidth: row.trackGeometry.border / 2,
          borderColor: theme.colors.arrangementLine,
          minWidth: 0,
          backgroundColor: theme.colors.arrangementSurfaceAlt,
          userSelect: "none",
          focusVisible: focusRing,
        }}
      >
        <div
          role="group"
          aria-label={`${t("trackLane")} ${track.name}`}
          testId={`track-lane-${track.id}`}
          style={{
            position: "relative",
            flexGrow: 1,
            minWidth: 0,
            height: "100%",
            overflow: "hidden",
            backgroundColor:
              selected && surface === "arrangement"
                ? theme.colors.arrangementSurfaceSelected
                : theme.colors.arrangementSurface,
            focusVisible: focusRing,
          }}
        >
          {showLane ? lane : null}
        </div>
        <TrackIdentity
          track={track}
          selected={selected && surface === "header"}
          renaming={renaming}
          onRename={() => {
            onFocusTrack(track.id)
            setRenaming(true)
          }}
          onRenameEnd={() => setRenaming(false)}
          onChoose={(range, additive) => choose("header", range, additive)}
          railCount={rails.length}
          dragHandlers={dragHandlers}
          dragging={dragging}
        />
        <TrackRouting track={track} />
        <TrackMixer track={track} />
        {dropTarget ? (
          <div
            aria-hidden="true"
            testId={`track-drop-target-${track.id}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: theme.design.editor.insertionLineWidth,
              pointerEvents: "none",
              backgroundColor: theme.colors.ring,
            }}
          />
        ) : null}
      </div>
    </TrackMenu>
  )
}
