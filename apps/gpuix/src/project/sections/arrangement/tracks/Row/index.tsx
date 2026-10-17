import { memo, useState } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { visibleTracks } from "@/project/model/types"
import { projectActions, useProjectState } from "@/project/adapters"
import { useTrackLabels } from "../labels"
import { TrackIdentity } from "../TrackIdentity"
import { TrackRouting } from "../TrackRouting"
import { TrackMixer } from "../TrackMixer"
import { TrackMenu } from "../TrackMenu"
import type { ReactNode } from "react"
import type { Props } from "@gpuix/react"
import type { GroupRail } from "@/project/model/track-groups"
import type { TrackRow as TrackRowGeometry } from "../../core/layout"

/**
 * Track header columns depend only on the track model and selection, not on the lane width,
 * so a panel resize re-renders the lane but reuses this subtree.
 */
const TrackHeader = memo(
  function TrackHeader({
    track,
    selected,
    renaming,
    setRenaming,
    onFocusTrack,
    choose,
    railCount,
    dragHandlers,
    dragging,
  }: {
    readonly track: TrackRowGeometry["track"]
    readonly selected: boolean
    readonly renaming: boolean
    readonly setRenaming: (renaming: boolean) => void
    readonly onFocusTrack: (id: string) => void
    readonly choose: (target: "arrangement" | "header", range: boolean, additive: boolean) => void
    readonly railCount: number
    readonly dragHandlers?: Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown">
    readonly dragging: boolean
  }) {
    return (
      <>
        <TrackIdentity
          track={track}
          selected={selected}
          renaming={renaming}
          onRename={() => {
            onFocusTrack(track.id)
            setRenaming(true)
          }}
          onRenameEnd={() => setRenaming(false)}
          onChoose={(range, additive) => choose("header", range, additive)}
          railCount={railCount}
          dragHandlers={dragHandlers}
          dragging={dragging}
        />
        <TrackRouting track={track} />
        <TrackMixer track={track} />
      </>
    )
  },
  (a, b) =>
    a.track === b.track &&
    a.selected === b.selected &&
    a.renaming === b.renaming &&
    a.railCount === b.railCount &&
    a.dragging === b.dragging
)

/**
 * Column dividers between lane | identity | routing | mixer. Absolutely positioned 1px lines
 * so they never take layout width from the columns they separate.
 */
function ColumnSeparators() {
  const theme = useTheme()
  const width = theme.design.shape.separatorWidth
  const line = (right: number) => (
    <div
      key={right}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: right - width / 2,
        width,
        backgroundColor: theme.colors.arrangementLine,
        pointerEvents: "none",
      }}
    />
  )
  const mixer =
    theme.layout.track.controlsWidth - theme.project.identityWidth - theme.project.routingWidth
  return (
    <>
      {line(theme.layout.track.controlsWidth)}
      {line(mixer + theme.project.routingWidth)}
      {line(mixer)}
    </>
  )
}

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
  const selected = useProjectState(state => state.session.selectedTrackIds.includes(track.id))
  const surface = useProjectState(state => state.session.trackSelectionSurface)
  const [renaming, setRenaming] = useState(false)
  const choose = (target: "arrangement" | "header", range: boolean, additive: boolean) => {
    const selection = useProjectState.getState().session.selectedTrackIds
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
          style={sx({
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
          })}
        >
          {showLane ? lane : null}
        </div>
        <TrackHeader
          track={track}
          selected={selected && surface === "header"}
          renaming={renaming}
          setRenaming={setRenaming}
          onFocusTrack={onFocusTrack}
          choose={choose}
          railCount={rails.length}
          dragHandlers={dragHandlers}
          dragging={dragging}
        />
        <ColumnSeparators />
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
