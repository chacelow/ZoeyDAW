import { memo, useMemo } from "react"
import type { Track } from "@/project/model/types"
import { clipLabel } from "@/project/model/clip-label"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { colorMix } from "@/shared/theme/color-mix"
import { FADE_HANDLE_PX, fadeHandleX } from "../core/clip-geometry"
import type { GridLine } from "../core/rulers/grid-lines"
import { clipLoopTicks, midiPreviewRects, patternPreviewRects } from "./render-projection"
import type { ClipCard } from "./render-projection"
import { resolveLaneColor } from "./appearance"
import type { PeakReader } from "./PeakReader"
import { WaveformPreview } from "./WaveformPreview"
import { Shape } from "@/shared/svg/Shape"
import type { ShapePath } from "@/shared/svg/Shape"
import { cubicPath } from "@/shared/svg/paths"

const NO_FADE_PATHS: readonly ShapePath[] = []

export const ClipCardView = memo(function ClipCardView({
  card,
  track,
  viewportWidth,
  numerator,
  grid,
  automationMode,
  readPeaks,
  onActivate,
}: {
  card: ClipCard
  track: Track
  viewportWidth: number
  numerator: number
  grid: readonly GridLine[]
  automationMode: boolean
  readPeaks: PeakReader
  onActivate: (id: string) => void
}) {
  const theme = useTheme()
  const g = card.geometry
  const clip = card.clip
  const visibleLeft = Math.max(0, g.left)
  const width = Math.max(0, Math.min(viewportWidth, g.left + g.width) - visibleLeft)
  const color = resolveLaneColor(clip.color ?? track.color, theme)
  const bodyColor = card.selected ? theme.colors.arrangementClipSelected : color
  const ink = theme.colors.primaryForeground
  const notes = useMemo(
    () =>
      clip.kind === "midi"
        ? midiPreviewRects(clip, g, numerator, viewportWidth)
        : clip.kind === "pattern"
          ? patternPreviewRects(clip, g, viewportWidth)
          : [],
    [clip, g, numerator, viewportWidth]
  )
  const sourceStartBar = 1 + ((visibleLeft - g.left) / g.width) * clip.lengthBars
  const sourceEndBar = 1 + ((visibleLeft + width - g.left) / g.width) * clip.lengthBars
  const loopTicks = useMemo(() => clipLoopTicks(clip, g, viewportWidth), [clip, g, viewportWidth])
  const fadePaths = useMemo(
    () =>
      g.fades.length
        ? g.fades
            .filter(fade => fade.active && fade.handlesVisible)
            .map(fade => ({
              d: cubicPath(fade.start, fade.segments),
              strokeWidth: theme.project.trackBorder,
            }))
        : NO_FADE_PATHS,
    [g.fades, theme.project.trackBorder]
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
              backgroundColor: colorMix(
                bodyColor,
                card.selected ? 90 : automationMode ? 25 : 55,
                "transparent"
              ),
              pointerEvents: "none",
            })}
          />
          {grid
            .filter(line => line.x >= visibleLeft && line.x < visibleLeft + width)
            .map(line => (
              <div
                key={line.bar}
                style={sx({
                  position: "absolute",
                  left: line.x - visibleLeft,
                  top: g.titleHeight,
                  width: 1,
                  height: g.bodyHeight,
                  backgroundColor: theme.colors.border,
                  opacity: card.hovered ? 0.3 : 0.4,
                  pointerEvents: "none",
                })}
              />
            ))}
          {notes.map((note, index) => (
            <div
              key={`${note.left}:${note.top}:${index}`}
              style={sx({
                position: "absolute",
                left: note.left - visibleLeft,
                top: note.top - g.top,
                width: note.width,
                height: note.height,
                backgroundColor: ink,
                opacity: automationMode ? 0.4 : 1,
                pointerEvents: "none",
              })}
            />
          ))}
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
          {!automationMode && !card.ghost && g.fades.some(fade => fade.handlesVisible) && (
            <>
              {fadePaths.length > 0 && (
                <Shape
                  width={width}
                  height={g.bodyHeight}
                  viewBox={`${visibleLeft} ${g.bodyTop} ${width} ${g.bodyHeight}`}
                  paths={fadePaths}
                  color={ink}
                  style={sx({
                    position: "absolute",
                    left: 0,
                    top: g.titleHeight,
                    pointerEvents: "none",
                  })}
                />
              )}
              {g.fades
                .filter(fade => fade.handlesVisible)
                .flatMap(fade => [
                  {
                    key: `${fade.edge}-peak`,
                    point: fade.edge === "in" ? fade.end : fade.start,
                    interactive: true,
                  },
                  {
                    key: `${fade.edge}-quiet`,
                    point: fade.edge === "in" ? fade.start : fade.end,
                    interactive: false,
                  },
                  ...(fade.active
                    ? [{ key: `${fade.edge}-curve`, point: fade.curve, interactive: true }]
                    : []),
                ])
                .map(anchor => (
                  <div
                    key={anchor.key}
                    testId={`fade-${clip.id}-${anchor.key}`}
                    style={sx({
                      position: "absolute",
                      left: fadeHandleX(g, anchor.point.x) - visibleLeft - FADE_HANDLE_PX / 2,
                      top: Math.max(
                        g.titleHeight,
                        Math.min(
                          g.height - FADE_HANDLE_PX,
                          anchor.point.y - g.top - FADE_HANDLE_PX / 2
                        )
                      ),
                      width: FADE_HANDLE_PX,
                      height: FADE_HANDLE_PX,
                      borderWidth: 1,
                      borderColor: ink,
                      backgroundColor: anchor.interactive
                        ? theme.colors.arrangementClipPaper
                        : color,
                      pointerEvents: "none",
                    })}
                  />
                ))}
            </>
          )}
        </>
      )}
      {loopTicks.map(x => (
        <div
          key={x}
          style={sx({
            position: "absolute",
            left: x - visibleLeft,
            top: 0,
            width: 1,
            height: theme.control["--spacing-control-track-gap"],
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
            backgroundColor: colorMix(theme.colors.foreground, 10, "transparent"),
            pointerEvents: "none",
          })}
        />
      )}
      <text
        style={sx({
          position: "absolute",
          left: g.left - visibleLeft + theme.control["--spacing-control-track-gap"],
          top: 0,
          height: g.titleHeight,
          width: Math.max(0, g.width - theme.control["--spacing-control-track-gap"] * 2),
          display: "flex",
          alignItems: "center",
          color: ink,
          fontSize: theme.control["--text-control-track"],
          whiteSpace: "nowrap",
          overflow: "hidden",
          pointerEvents: "none",
          userSelect: "none",
        })}
      >
        {clipLabel(clip)}
      </text>
    </div>
  )
})
