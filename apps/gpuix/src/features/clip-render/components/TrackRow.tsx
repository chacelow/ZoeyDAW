/**
 * One track row: a fixed-width name header plus a scrolling clip lane.
 * Only Clips whose bar range intersects `visibleRange` are mounted — the
 * culling step the official gpuix timeline example relies on to keep a
 * dense arrangement cheap (see docs/research/gpuix-rendering-alternatives.md).
 */
import { memo } from "react"
import { sx } from "../../../shared/theme/style"
import { isClipVisible, type VisibleRange } from "../model/layout"
import { ClipBlock, type ClipGesture } from "./ClipBlock"
import type { Theme } from "../../../shared/theme/ThemeProvider"
import type { DemoTrack } from "../model/demo-data"

export interface TrackRowProps {
  track: DemoTrack
  rowHeight: number
  scrollLeftPx: number
  visibleRange: VisibleRange
  theme: Theme
  gesture: ClipGesture
}

export const TrackRow = memo(function TrackRow({
  track,
  rowHeight,
  scrollLeftPx,
  visibleRange,
  theme,
  gesture,
}: TrackRowProps) {
  const color = theme.colors[track.color]
  const visibleClips = track.clips.filter(clip => isClipVisible(clip, visibleRange))

  return (
    <div
      style={sx({
        display: "flex",
        flexDirection: "row",
        width: "100%",
        height: rowHeight,
        borderBottomWidth: theme.project.trackBorder,
        borderColor: theme.colors.border,
      })}
    >
      <div
        style={sx({
          width: theme.project.identityWidth,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          paddingLeft: theme.control["--spacing-control-gap"] * 4,
          borderRightWidth: theme.project.trackBorder,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.editorShell,
        })}
      >
        <text style={{ fontSize: 11, color: theme.colors.foreground }}>{track.name}</text>
      </div>
      <div
        style={sx({
          position: "relative",
          flexGrow: 1,
          minWidth: 0,
          height: rowHeight,
          overflow: "hidden",
          backgroundColor: theme.colors.background,
        })}
      >
        {visibleClips.map(clip => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            rowHeight={rowHeight}
            scrollLeftPx={scrollLeftPx}
            color={color}
            theme={theme}
            gesture={gesture}
          />
        ))}
      </div>
    </div>
  )
})
