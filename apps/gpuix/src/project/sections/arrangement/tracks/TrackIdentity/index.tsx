import { useTrackLabels } from "../labels"
import { Button } from "../../../../../ui/controls"
import { useTheme } from "../../../../../shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "../../../../adapters"
import { TRACK_TITLE_HEIGHT } from "../../../../layout"
import { trackFill } from "../track-color"
import { TrackNameInput } from "./NameInput"
import { AutomationSelector } from "./AutomationSelector"
import type { Props } from "@gpuix/react"
import type { Track } from "../../../../model/types"

export function TrackIdentity({
  track,
  selected,
  renaming,
  onRename,
  onRenameEnd,
  onChoose,
  dragHandlers,
  dragging,
  railCount,
}: {
  readonly track: Track
  readonly selected: boolean
  readonly renaming: boolean
  readonly onRename: () => void
  readonly onRenameEnd: () => void
  readonly onChoose: (range: boolean, additive: boolean) => void
  readonly dragHandlers?: Pick<Props, "onMouseDown" | "onMouseMove" | "onMouseUp" | "onKeyDown">
  readonly dragging: boolean
  readonly railCount: number
}) {
  const { t } = useTrackLabels()
  const theme = useTheme()
  const ink = theme.appearance === "dark" ? theme.colors.card : theme.colors.foreground
  const automation = useProjectState(state => state.workspace.automationMode)
  const gutter = (railCount + (track.kind === "group" ? 1 : 0)) * theme.project.groupRailWidth
  return (
    <div
      role="group"
      aria-label={`${t("trackIdentity")} ${track.name}`}
      testId={`track-identity-${track.id}`}
      tabIndex={0}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        width: theme.project.identityWidth,
        minWidth: 0,
        height: "100%",
        paddingLeft: gutter,
        overflow: "hidden",
        userSelect: "none",
        backgroundColor: selected
          ? theme.colors.arrangementClipSelected
          : trackFill(track.color, theme),
      }}
      onKeyDown={event => {
        if (event.key === "enter")
          onChoose(
            Boolean(event.modifiers?.shift),
            Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
          )
        if (event.key === "f2") onRename()
        dragHandlers?.onKeyDown?.(event)
      }}
    >
      <div
        testId={`track-title-${track.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          height: TRACK_TITLE_HEIGHT,
          flexShrink: 0,
          gap: theme.control["--spacing-control-track-gap"],
          paddingLeft: theme.control["--spacing-control-track-gap"],
          paddingRight: theme.control["--spacing-control-track-gap"],
        }}
      >
        <Button
          iconOnly
          variant="ghost"
          label={`${t(track.collapsed ? "expand" : "collapse")} ${track.name}`}
          testId={`track-fold-${track.id}`}
          aria-expanded={!track.collapsed}
          onClick={() => projectActions.updateTrack(track.id, { collapsed: !track.collapsed })}
          style={{ borderWidth: 0, borderRadius: 0 }}
        >
          <text aria-hidden="true" style={{ color: ink }}>
            {track.collapsed ? "▸" : "▾"}
          </text>
        </Button>
        {renaming ? (
          <TrackNameInput track={track} onFinish={onRenameEnd} />
        ) : (
          <Button
            testId={`track-label-${track.id}`}
            variant="ghost"
            label={`${t("trackIdentity")} ${track.name}`}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              minWidth: 0,
              height: theme.control["--spacing-control-track"],
              borderWidth: 0,
              borderRadius: 0,
              paddingLeft: 0,
              paddingRight: 0,
              justifyContent: "flex-start",
              color: ink,
              cursor: dragging ? "grabbing" : track.kind === "main" ? "default" : "grab",
            }}
            onMouseDown={event => {
              if (event.button !== 0) return
              onChoose(
                Boolean(event.modifiers?.shift),
                Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
              )
              if (event.clickCount === 2) onRename()
              else dragHandlers?.onMouseDown?.(event)
            }}
            onMouseMove={dragHandlers?.onMouseMove}
            onMouseUp={dragHandlers?.onMouseUp}
            onKeyDown={event => {
              if (event.key === "enter")
                onChoose(
                  Boolean(event.modifiers?.shift),
                  Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
                )
              if (event.key === "f2") onRename()
            }}
          >
            <text
              style={{
                fontSize: theme.control["--text-control-track"],
                color: ink,
                fontWeight: 500,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                userSelect: "none",
              }}
            >
              {track.name}
            </text>
          </Button>
        )}
      </div>
      {!track.collapsed && automation ? (
        <div style={{ padding: theme.control["--spacing-control-track-gap"], minWidth: 0 }}>
          <AutomationSelector track={track} />
        </div>
      ) : null}
      {track.collapsed && track.kind === "audio" ? (
        <div
          aria-hidden="true"
          testId={`track-folded-fade-${track.id}`}
          style={{
            position: "absolute",
            left: gutter,
            right: 0,
            top: 0,
            bottom: 0,
            pointerEvents: "none",
            background: {
              type: "linear-gradient",
              angle: 90,
              stops: [
                { position: 0, color: "transparent" },
                { position: 1, color: theme.colors.arrangementFadeMask },
              ],
            },
          }}
        />
      ) : null}
    </div>
  )
}
