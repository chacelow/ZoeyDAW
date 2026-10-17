import { useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import { useTrackLabels } from "../labels"
import { Button, TruncatedText } from "@/ui/controls"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { projectActions, useProjectState } from "@/project/adapters"
import { contentFill } from "@/shared/theme/content-color"
import { TrackNameInput } from "./NameInput"
import { AutomationSelector } from "./AutomationSelector"
import { Icon } from "@/ui/controls/Icon"
import type { KeyEvent, Props, PublicInstance } from "@gpuix/react"
import type { Track } from "@/project/model/types"

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
  const { renderer } = useGpuix()
  const identity = useRef<PublicInstance | null>(null)
  const [labelHovered, setLabelHovered] = useState(false)
  const ink = theme.colors.arrangementClipInk
  const automation = useProjectState(state => state.workspace.automationMode)
  const gutter = (railCount + (track.kind === "group" ? 1 : 0)) * theme.project.groupRailWidth
  const focusRing = {
    outlineWidth: theme.design.shape.focusRingWidth,
    outlineOffset: -theme.design.shape.focusRingWidth,
    outlineColor: theme.colors.ring,
  }
  const handleKeyDown = (event: KeyEvent) => {
    if (event.key === "enter" || event.key === "f2") {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "f2") onRename()
      else
        onChoose(
          Boolean(event.modifiers?.shift),
          Boolean(event.modifiers?.cmd || event.modifiers?.ctrl)
        )
      return
    }
    dragHandlers?.onKeyDown?.(event)
  }
  return (
    <div
      ref={identity}
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
        backgroundColor: theme.colors.arrangementSurfaceAlt,
        focusVisible: focusRing,
      }}
      onKeyDown={event => {
        if (renderer?.getFocusedElementId?.() === identity.current?.id) handleKeyDown(event)
      }}
    >
      <div
        testId={`track-title-${track.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          height: theme.layout.track.titleHeight,
          flexShrink: 0,
          gap: theme.control["--spacing-control-gap"],
          paddingLeft: theme.control["--spacing-control-track-pad"],
          paddingRight: theme.control["--spacing-control-track-pad"],
          backgroundColor: selected
            ? theme.colors.arrangementClipSelected
            : contentFill(track.color, theme.colors, theme.design.colorRecipes.contentPaperTint),
        }}
      >
        <Button
          iconOnly
          variant="ghost"
          label={`${t(track.collapsed ? "expand" : "collapse")} ${track.name}`}
          testId={`track-fold-${track.id}`}
          aria-expanded={!track.collapsed}
          onClick={() => projectActions.updateTrack(track.id, { collapsed: !track.collapsed })}
        >
          <Icon
            name={track.collapsed ? "ChevronRight" : "ChevronDown"}
            size={theme.control["--spacing-control-icon"]}
            color={ink}
          />
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
              justifyContent: "flex-start",
              color: ink,
              cursor: dragging
                ? theme.design.cursors.grabbing
                : track.kind === "main"
                  ? theme.design.cursors.default
                  : theme.design.cursors.grab,
              focusVisible: focusRing,
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
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setLabelHovered(true)}
            onMouseLeave={() => setLabelHovered(false)}
          >
            <TruncatedText
              testId={`track-name-${track.id}`}
              hovered={labelHovered}
              style={{
                fontSize: theme.control["--text-control-track"],
                color: ink,
                fontWeight: theme.design.typography.weights.medium,
                flexGrow: 0,
                userSelect: "none",
              }}
            >
              {track.name}
            </TruncatedText>
          </Button>
        )}
      </div>
      {!track.collapsed && automation ? (
        <div style={{ padding: theme.control["--spacing-control-track-gap"], minWidth: 0 }}>
          <AutomationSelector track={track} />
        </div>
      ) : null}
    </div>
  )
}
