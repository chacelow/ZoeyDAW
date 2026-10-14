/**
 * One Clip rectangle. Follows this project's established clip painter style
 * (`apps/web/.../canvas/painters/clip.ts`): the title bar is always fully
 * opaque track color, the body underneath is the same color at reduced
 * opacity. Dragging the body repositions the Clip; dragging an edge handle
 * resizes it. Both gestures write straight into the owning state on every
 * `onMouseMove`, so the rendered position is always the live value — there
 * is nothing to snap back to on release.
 */
import { memo } from "react"
import { sx } from "@/shared/theme/style"
import { clipLabel } from "../model/clip-label"
import { PX_PER_BAR } from "../model/layout"
import type { Theme } from "@/shared/theme/ThemeProvider"
import type { Clip } from "@/shared/model/types"
import type { EventPayload } from "@gpuix/react"

export type ClipDragKind = "move" | "resize-left" | "resize-right"

export interface ClipGesture {
  begin: (kind: ClipDragKind, clip: Clip, event: EventPayload) => void
  move: (event: EventPayload) => void
  end: (event: EventPayload) => void
}

export interface ClipBlockProps {
  clip: Clip
  rowHeight: number
  scrollLeftPx: number
  color: string
  theme: Theme
  gesture: ClipGesture
}

export const ClipBlock = memo(function ClipBlock({
  clip,
  rowHeight,
  scrollLeftPx,
  color,
  theme,
  gesture,
}: ClipBlockProps) {
  const inset = theme.control["--spacing-control-track-gap"]
  const titleHeight =
    theme.control["--spacing-control-track"] + theme.control["--spacing-control-gap"]
  const handleWidth = Math.min(
    theme.control["--spacing-control-gap"] * 3,
    (clip.lengthBars * PX_PER_BAR) / 3
  )
  const left = clip.startBar * PX_PER_BAR - scrollLeftPx
  const width = clip.lengthBars * PX_PER_BAR
  const bodyHeight = Math.max(0, rowHeight - inset * 2 - titleHeight)

  return (
    <div
      testId={`clip-${clip.id}`}
      style={sx({
        position: "absolute",
        left,
        top: inset,
        width,
        height: rowHeight - inset * 2,
        borderRadius: theme.control["--spacing-control-gap"],
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
        active: { cursor: "grabbing" },
      })}
      onMouseDown={event => gesture.begin("move", clip, event)}
      onMouseMove={gesture.move}
      onMouseUp={gesture.end}
    >
      <div
        style={sx({
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: titleHeight,
          backgroundColor: color,
          paddingLeft: inset,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
        })}
      >
        <text
          style={sx({
            fontSize: theme.control["--text-control-track"],
            color: theme.colors.arrangementClipPaper,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          })}
        >
          {clipLabel(clip)}
        </text>
      </div>
      {bodyHeight > 0 && (
        <div
          style={sx({
            position: "absolute",
            left: 0,
            top: titleHeight,
            width: "100%",
            height: bodyHeight,
            backgroundColor: color,
            opacity: 0.4,
            pointerEvents: "none",
          })}
        />
      )}
      <div
        testId={`clip-${clip.id}-resize-left`}
        style={sx({
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: handleWidth,
          cursor: "col-resize",
          hover: { backgroundColor: theme.colors.canvasScrollbarHover },
        })}
        onMouseDown={event => gesture.begin("resize-left", clip, event)}
        onMouseMove={gesture.move}
        onMouseUp={gesture.end}
      />
      <div
        testId={`clip-${clip.id}-resize-right`}
        style={sx({
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: handleWidth,
          cursor: "col-resize",
          hover: { backgroundColor: theme.colors.canvasScrollbarHover },
        })}
        onMouseDown={event => gesture.begin("resize-right", clip, event)}
        onMouseMove={gesture.move}
        onMouseUp={gesture.end}
      />
    </div>
  )
})
