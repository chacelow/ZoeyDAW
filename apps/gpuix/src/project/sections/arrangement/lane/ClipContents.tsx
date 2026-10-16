import { memo, useLayoutEffect, useMemo } from "react"
import { clipLabel } from "@/project/model/clip-label"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { clipLoopTicks, midiPreviewRects, patternPreviewRects } from "./render-projection"
import type { ClipLocalContent } from "./clip-card-projection"
import { resolveContentColor, contentFill } from "@/shared/theme/content-color"
import type { PeakReader } from "@/project/model/backend"
import { WaveformPreview } from "./WaveformPreview"
import { ClipFades } from "./ClipFades"
import { QuadBatch } from "@/shared/quads/QuadBatch"
import { useQuadBatch } from "@/shared/quads/useQuadBatch"
import { useGridQuads } from "./GridQuads"
import type { CreationNames } from "@/project/defaults/template"

export const ClipContentsView = memo(function ClipContentsView({
  card,
  trackColor,
  numerator,
  automationMode,
  readPeaks,
  creationNames,
}: {
  card: ClipLocalContent
  trackColor: string
  numerator: number
  automationMode: boolean
  readPeaks: PeakReader
  creationNames: Pick<CreationNames, "clip">
}) {
  const theme = useTheme()
  const g = card.geometry
  const clip = card.clip
  const viewportWidth = card.viewportWidth
  const visibleLeft = Math.max(0, g.left)
  const width = Math.max(0, Math.min(viewportWidth, g.left + g.width) - visibleLeft)
  const gridBatch = useGridQuads(card.grid, visibleLeft, width, g.bodyHeight, true)
  const token = clip.color ?? trackColor
  const paint = useMemo(
    () => ({
      title: resolveContentColor(token, theme.colors),
      body: contentFill(token, theme.colors, theme.design.colorRecipes.contentPaperTint),
    }),
    [token, theme.colors, theme.design.colorRecipes.contentPaperTint]
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
    <>
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
      {loopTicks.map((x, ordinal) => (
        <div
          key={ordinal}
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
        {clipLabel(clip, creationNames)}
      </text>
    </>
  )
})
