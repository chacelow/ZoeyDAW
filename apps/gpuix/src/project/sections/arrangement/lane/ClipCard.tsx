import { memo, useLayoutEffect, useMemo } from "react"
import { clipLabel } from "@/project/model/clip-label"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { clipLoopTicks, midiPreviewRects, patternPreviewRects } from "./render-projection"
import type { RenderClipCard } from "./clip-card-projection"
import { resolveContentColor, contentFill } from "@/shared/theme/content-color"
import type { PeakReader } from "@/project/model/backend"
import { WaveformPreview } from "./WaveformPreview"
import { ClipFades } from "./ClipFades"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useGridQuads } from "./GridQuads"

export const ClipCardView = memo(function ClipCardView({
  card,
  trackColor,
  viewportWidth,
  numerator,
  automationMode,
  readPeaks,
  onActivate,
}: {
  card: RenderClipCard
  trackColor: string
  viewportWidth: number
  numerator: number
  automationMode: boolean
  readPeaks: PeakReader
  onActivate: (id: string) => void
}) {
  const theme = useTheme()
  const g = card.geometry
  const clip = card.clip
  const visibleLeft = Math.max(0, g.left)
  const width = Math.max(0, Math.min(viewportWidth, g.left + g.width) - visibleLeft)
  const gridBatch = useGridQuads(card.grid, visibleLeft, width, g.bodyHeight, true)
  const token = clip.color ?? trackColor
  const paint = useMemo(
    () => ({
      title: resolveContentColor(token, theme.colors),
      body: contentFill(token, theme.colors),
    }),
    [token, theme.colors]
  )
  const color = paint.title
  const bodyColor = card.selected ? theme.colors.arrangementClipSelected : paint.body
  const ink = theme.colors.arrangementClipInk
  const notes = useMemo(
    () =>
      clip.kind === "midi"
        ? midiPreviewRects(clip, g, numerator, viewportWidth, theme.project)
        : clip.kind === "pattern"
          ? patternPreviewRects(clip, g, viewportWidth, theme.project)
          : [],
    [clip, g, numerator, viewportWidth, theme.project]
  )
  const noteBatch = useQuadBatch()
  const noteQuads = useMemo(() => {
    const values = new Float32Array(notes.length * 4)
    let offset = 0
    for (const note of notes) {
      values[offset] = note.left - visibleLeft
      values[offset + 1] = note.top - g.top
      values[offset + 2] = note.width
      values[offset + 3] = note.height
      offset += 4
    }
    return values
  }, [notes, visibleLeft, g.top])
  useLayoutEffect(() => {
    noteBatch.setQuads(noteQuads)
  }, [noteBatch, noteQuads])
  const sourceStartBar = 1 + ((visibleLeft - g.left) / g.width) * clip.lengthBars
  const sourceEndBar = 1 + ((visibleLeft + width - g.left) / g.width) * clip.lengthBars
  const loopTicks = useMemo(
    () => clipLoopTicks(clip, g, viewportWidth, theme.project),
    [clip, g, viewportWidth, theme.project]
  )
  return (
    <div
      testId={`${card.ghost ? "clip-ghost" : "clip-source"}-${clip.id}`}
      role="button"
      aria-label={clipLabel(clip)}
      aria-pressed={card.selected}
      tabIndex={card.ghost ? -1 : 0}
      onKeyDown={event => {
        if (event.key !== "enter") return
        event.preventDefault()
        event.stopPropagation()
        onActivate(clip.id)
      }}
      style={sx({
        position: "absolute",
        left: visibleLeft,
        top: g.top,
        width,
        height: g.height,
        overflow: "hidden",
        userSelect: "none",
        opacity: card.ghost ? 0.5 : 1,
        pointerEvents: "none",
        keyboardFocusDim: false,
        focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
      })}
    >
      <div
        style={sx({
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height: g.titleHeight,
          backgroundColor:
            card.selected && g.bodyHeight === 0 ? theme.colors.arrangementClipSelected : color,
          pointerEvents: "none",
        })}
      />
      {g.bodyHeight > 0 && (
        <>
          <div
            style={sx({
              position: "absolute",
              left: 0,
              top: g.titleHeight,
              width,
              height: g.bodyHeight,
              backgroundColor: bodyColor,
              opacity: card.selected ? 0.9 : automationMode ? 0.25 : 0.55,
              pointerEvents: "none",
            })}
          />
          {gridBatch.hasMajor && (
            <QuadBatch
              ref={gridBatch.majorRef}
              aria-hidden
              style={sx({
                position: "absolute",
                left: 0,
                top: g.titleHeight,
                width,
                height: g.bodyHeight,
                color: theme.colors.arrangementLine,
                opacity: card.hovered ? 0.3 : 0.4,
                pointerEvents: "none",
              })}
            />
          )}
          {noteQuads.length > 0 && (
            <QuadBatch
              ref={noteBatch.ref}
              aria-hidden
              style={sx({
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height: g.height,
                color: ink,
                opacity: automationMode ? 0.4 : 1,
                pointerEvents: "none",
              })}
            />
          )}
          {clip.kind === "audio" && (
            <WaveformPreview
              id={clip.id}
              sourceId={clip.samplePath}
              startBar={sourceStartBar}
              endBar={sourceEndBar}
              contentOffsetBars={clip.sourceOffsetBars ?? 0}
              width={width}
              height={g.bodyHeight}
              top={g.titleHeight}
              color={ink}
              opacity={automationMode ? 0.4 : 1}
              readPeaks={readPeaks}
            />
          )}
        </>
      )}
      {card.fadeGeometry && !automationMode && (
        <ClipFades
          id={clip.id}
          geometry={card.fadeGeometry}
          visibleLeft={visibleLeft - g.left}
          width={width}
          bodyFill={bodyColor}
        />
      )}
      {loopTicks.map(x => (
        <div
          key={x}
          style={sx({
            position: "absolute",
            left: x - visibleLeft,
            top: 0,
            width: 1,
            height: theme.project.arrangementLoopTickHeight,
            backgroundColor: ink,
            pointerEvents: "none",
          })}
        />
      ))}
      {card.hovered && !card.selected && (
        <div
          style={sx({
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height: g.height,
            backgroundColor: theme.colors.foreground,
            opacity: 0.1,
            pointerEvents: "none",
          })}
        />
      )}
      <text
        style={sx({
          position: "absolute",
          left: g.left - visibleLeft + theme.project.arrangementClipLabelClipInset,
          top: 0,
          height: g.titleHeight,
          width: Math.max(0, g.width - theme.project.arrangementClipLabelClipInset * 2),
          overflow: "hidden",
          paddingLeft:
            theme.project.arrangementClipLabelInset - theme.project.arrangementClipLabelClipInset,
          display: "flex",
          alignItems: "center",
          color: ink,
          fontSize: theme.control["--text-control-track"],
          whiteSpace: "nowrap",
          userSelect: "none",
          pointerEvents: "none",
        })}
      >
        {clipLabel(clip)}
      </text>
    </div>
  )
})
