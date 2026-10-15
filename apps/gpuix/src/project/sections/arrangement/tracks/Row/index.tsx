import { useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "@/project/adapters"
import { COLLAPSED_TRACK_HEIGHT, MAX_TRACK_HEIGHT } from "@/project/layout"
import { visibleTracks } from "@/project/model/types"
import { useTrackLabels } from "../labels"
import { TrackIdentity } from "../TrackIdentity"
import { TrackRouting } from "../TrackRouting"
import { TrackMixer } from "../TrackMixer"
import { TrackMenu } from "../TrackMenu"
import { GroupOverview } from "../GroupOverview"
import { useTrackResize } from "./useTrackResize"
import type { ReactNode } from "react"
import type { KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { GroupRail } from "@/project/model/track-groups"
import type { Track } from "@/project/model/types"
import type { TrackRow as TrackRowGeometry } from "../../core/layout"
import type { ArrangementViewport } from "../../core/scene"

export function TrackRow({
  row,
  viewport,
  rails,
  descendants,
  lane,
  showLane,
  onFocusTrack,
  dragHandlers,
  dragging,
  dropTarget,
}: {
  readonly row: TrackRowGeometry
  readonly viewport: ArrangementViewport
  readonly rails: readonly GroupRail[]
  readonly descendants: readonly Track[]
  readonly lane: ReactNode
  readonly showLane: boolean
  readonly onFocusTrack: (id: string) => void
  readonly dragHandlers?: Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown">
  readonly dragging: boolean
  readonly dropTarget: boolean
}) {
  const { track } = row
  const theme = useTheme()
  const { renderer } = useGpuix()
  const laneElement = useRef<PublicInstance | null>(null)
  const { t } = useTrackLabels()
  const selection = useProjectState(state => state.session.selectedTrackIds)
  const surface = useProjectState(state => state.session.trackSelectionSurface)
  const selected = selection.includes(track.id)
  const [renaming, setRenaming] = useState(false)
  const resizeHandlers = useTrackResize(track)
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
  const pinned = track.kind === "return" || track.kind === "main"
  const focusRing = {
    outlineWidth: theme.project.trackBorder / 2,
    outlineOffset: -theme.project.trackBorder / 2,
    outlineColor: theme.colors.ring,
  }
  const selectFromKeyboard = (event: KeyEvent) => {
    if (event.key !== "enter") return
    event.preventDefault()
    event.stopPropagation()
    choose(
      "arrangement",
      Boolean(event.modifiers?.shift),
      Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
    )
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
          borderTopWidth: theme.project.trackBorder / 2,
          borderBottomWidth: theme.project.trackBorder / 2,
          borderColor: theme.colors.arrangementLine,
          minWidth: 0,
          backgroundColor: theme.colors.arrangementSurfaceAlt,
          userSelect: "none",
          focusVisible: focusRing,
        }}
      >
        <div
          ref={laneElement}
          role="group"
          aria-label={`${t("trackLane")} ${track.name}`}
          tabIndex={0}
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
          onMouseDown={event => {
            if (event.button === 0)
              choose(
                "arrangement",
                Boolean(event.modifiers?.shift),
                Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
              )
          }}
          onKeyDown={event => {
            if (renderer?.getFocusedElementId?.() === laneElement.current?.id)
              selectFromKeyboard(event)
          }}
        >
          {showLane ? (
            track.kind === "group" && track.collapsed ? (
              <GroupOverview
                track={track}
                descendants={descendants}
                viewport={viewport}
                height={row.height - theme.project.trackBorder}
              />
            ) : (
              lane
            )
          ) : null}
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
        <div
          role="separator"
          tabIndex={0}
          aria-label={`${t("trackHeight")} ${track.name}`}
          aria-orientation="horizontal"
          aria-valuemin={COLLAPSED_TRACK_HEIGHT}
          aria-valuemax={MAX_TRACK_HEIGHT}
          aria-valuenow={row.height}
          testId={`track-resize-${track.id}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            ...(pinned ? { top: 0 } : { bottom: 0 }),
            height: theme.control["--spacing-control-track-gap"],
            cursor: "ns-resize",
            focusVisible: focusRing,
          }}
          {...resizeHandlers}
        />
        {dropTarget ? (
          <div
            aria-hidden="true"
            testId={`track-drop-target-${track.id}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 1,
              pointerEvents: "none",
              backgroundColor: theme.colors.ring,
            }}
          />
        ) : null}
      </div>
    </TrackMenu>
  )
}
