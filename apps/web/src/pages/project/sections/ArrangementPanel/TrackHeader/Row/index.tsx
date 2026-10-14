import { memo, useEffect, useRef, useState } from "react"
import { cn } from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { visibleTracks } from "@/pages/project/model/types"
import {
  COLLAPSED_TRACK_HEIGHT,
  MAX_TRACK_HEIGHT,
  resizeTrackHeight,
  TRACK_RESIZE_STEP,
  TRACK_REVEAL_THRESHOLD,
  trackHeight,
} from "@/pages/project/layout"
import { TrackIdentity } from "../TrackIdentity"
import { GroupRails } from "../GroupRails"
import { TrackRouting } from "../TrackRouting"
import { TrackMixer } from "../TrackMixer"
import { TrackMenu } from "../TrackMenu"
import type { GroupRail } from "@/pages/project/model/track-groups"
import type { Track } from "@/pages/project/model/types"

export const TrackHeaderRow = memo(function TrackHeaderRow({
  track,
  rails,
}: {
  readonly track: Track
  readonly rails: readonly GroupRail[]
}) {
  const { t } = useTranslation()
  const resizeGesture = useProjectEditGesture((patch: Pick<Track, "collapsed" | "heightPx">) =>
    projectActions.updateTrack(track.id, patch)
  )
  const selection = useProjectState(s => s.session.selectedTrackIds)
  const selectionSurface = useProjectState(s => s.session.trackSelectionSurface)
  const selected = selection.includes(track.id)
  const headerSelected = selected && selectionSurface === "header"
  const allTracks = useProjectState(s => s.document.tracks)
  const [renaming, setRenaming] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)
  const resize = useRef<{
    y: number
    track: Track
    last: Pick<Track, "collapsed" | "heightPx">
  } | null>(null)
  useEffect(
    () => () => {
      if (!resize.current) return
      resize.current = null
      resizeGesture.onGestureCancel()
    },
    [track.id, resizeGesture]
  )
  const height = trackHeight(track)
  const isPinned = track.kind === "return" || track.kind === "main"
  const choose = (range: boolean, additive: boolean) => {
    if (range && selection.length) {
      const ids = visibleTracks(allTracks).map(item => item.id)
      const start = ids.indexOf(selection[0])
      const end = ids.indexOf(track.id)
      if (start !== -1 && end !== -1) {
        projectActions.selectTracks(
          ids.slice(Math.min(start, end), Math.max(start, end) + 1),
          "header"
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
      "header"
    )
  }
  return (
    <TrackMenu track={track} onRename={() => setRenaming(true)}>
      <div
        data-track-header={track.id}
        role="group"
        aria-label={`${t("arrangement.trackIdentity")} ${track.name}`}
        tabIndex={0}
        data-collapsed={track.collapsed || undefined}
        data-selected={headerSelected || undefined}
        className={cn(
          "arrangement-track-header relative grid grid-rows-[minmax(0,1fr)] border border-[var(--arrangement-line)]",
          dropTarget && "border-t-primary border-t-2"
        )}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.key !== "Enter") {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          choose(event.shiftKey, event.metaKey || event.ctrlKey)
        }}
        style={{ height }}
        onPointerDown={event => {
          if (
            event.button !== 0 ||
            (event.target instanceof Element && event.target.closest("button,input,[role=slider]"))
          ) {
            return
          }
          choose(event.shiftKey, event.metaKey || event.ctrlKey)
        }}
        onDoubleClick={event => {
          if (
            event.target instanceof Element &&
            event.target.closest("button,input,[role=slider],[role=separator]")
          ) {
            return
          }
          setRenaming(true)
        }}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes("application/x-zoeydaw-track")) {
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = "move"
          setDropTarget(true)
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={event => {
          event.preventDefault()
          setDropTarget(false)
          const id = event.dataTransfer.getData("application/x-zoeydaw-track")
          if (id && id !== track.id) {
            projectActions.reorderTrack(id, track.id)
          }
        }}
      >
        <div
          className="arrangement-track-identity flex min-w-0"
          role="group"
          draggable={!renaming && track.kind !== "main"}
          onDragStart={event => {
            if (event.target instanceof Element && event.target.closest("input,button")) {
              event.preventDefault()
              return
            }
            event.dataTransfer.setData("application/x-zoeydaw-track", track.id)
            event.dataTransfer.effectAllowed = "move"
          }}
        >
          <GroupRails rails={rails} />
          <TrackIdentity
            track={track}
            selected={headerSelected}
            renaming={renaming}
            onRenameEnd={() => setRenaming(false)}
          />
        </div>
        <TrackRouting track={track} />
        <TrackMixer track={track} />
        <div
          role="separator"
          tabIndex={0}
          aria-label={`${t("arrangement.trackHeight")} ${track.name}`}
          aria-orientation="horizontal"
          aria-valuemin={COLLAPSED_TRACK_HEIGHT}
          aria-valuemax={MAX_TRACK_HEIGHT}
          aria-valuenow={height}
          className={cn(
            "focus-visible:bg-primary/50 absolute inset-x-0 h-[4px] cursor-row-resize",
            isPinned ? "top-0" : "bottom-0"
          )}
          style={{
            left: `calc(${rails.length + (track.kind === "group" ? 1 : 0)} * var(--arrangement-group-rail-width))`,
          }}
          onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
              return
            }
            event.preventDefault()
            projectActions.updateTrack(
              track.id,
              resizeTrackHeight(
                track,
                (event.key === "ArrowUp") === isPinned
                  ? track.collapsed
                    ? TRACK_REVEAL_THRESHOLD
                    : TRACK_RESIZE_STEP
                  : -TRACK_RESIZE_STEP
              )
            )
          }}
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
            if (event.button !== 0) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            resize.current = {
              y: event.clientY,
              track,
              last: { collapsed: track.collapsed, heightPx: track.heightPx },
            }
            resizeGesture.onGestureStart()
          }}
          onPointerMove={event => {
            const anchor = resize.current
            if (!anchor) {
              return
            }
            const next = resizeTrackHeight(
              anchor.track,
              (event.clientY - anchor.y) * (isPinned ? -1 : 1)
            )
            if (
              next.collapsed === anchor.last.collapsed &&
              next.heightPx === anchor.last.heightPx
            ) {
              return
            }
            anchor.last = next
            resizeGesture.onChange(next)
          }}
          onPointerUp={() => {
            if (!resize.current) {
              return
            }

            resize.current = null
            resizeGesture.onGestureEnd()
          }}
          onPointerCancel={() => {
            if (!resize.current) {
              return
            }

            resize.current = null
            resizeGesture.onGestureCancel()
          }}
        />
      </div>
    </TrackMenu>
  )
})
