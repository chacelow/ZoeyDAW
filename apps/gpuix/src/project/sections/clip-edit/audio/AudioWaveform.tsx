import { useEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, PublicInstance } from "@gpuix/react"
import { useProjectState } from "@/project/adapters"
import { formatAudioMusicalValue, getAudioClipSettings } from "@/project/model/audio-editor"
import { DEFAULT_FADE_CURVE, fadeBezierSegments, fadeControls } from "@/project/model/fades"
import { timeTickLabel } from "@/project/model/timeline-ticks"
import { Shape } from "@/shared/svg/Shape"
import { cubicPath } from "@/shared/svg/paths"
import { colorMix } from "@/shared/theme/color-mix"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { SourceMarker } from "./SourceMarker"
import { SourceWaveform } from "./SourceWaveform"
import { markerPosition } from "./markers"
import {
  overviewExtent,
  panSource,
  sourceRange,
  sourceTickStep,
  sourceTicks,
  zoomSource,
} from "./source-view"
import type { PeakReader } from "@/project/model/backend"
import type { AudioClip } from "@/project/model/types"
import type { AudioEditorLabels } from "../labels"
import type { SourceView } from "./source-view"
import { useClipEditorEnvironment } from "../environment"

/**
Source view of an audio clip: musical ruler, loop strip with its markers, the envelope with Start/End
and fade markers, a time ruler, and an overview that pans the view. View range is local UI state.
*/
export function AudioWaveform({
  clip,
  color,
  labels,
  readPeaks,
}: {
  readonly clip: AudioClip
  readonly color: string
  readonly labels: AudioEditorLabels
  readonly readPeaks: PeakReader
}) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const transport = useProjectState(state => state.document.transport)
  const settings = getAudioClipSettings(clip, transport.bpm)
  const range = sourceRange(clip, settings)
  const [view, setView] = useState<SourceView>(range)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selection, setSelection] = useState<number | null>(null)
  const surface = useRef<PublicInstance | null>(null)
  const overview = useRef<PublicInstance | null>(null)
  const drag = useRef<{ kind: "pan" | "overview"; x: number; start: number; scale: number } | null>(
    null
  )
  const environment = useClipEditorEnvironment()
  useEffect(
    () =>
      environment.subscribeWindowActive(active => {
        if (!active) drag.current = null
      }),
    [environment]
  )

  const strip = theme.control["--spacing-control-track"]
  const rulerHeight = theme.project.audioRulerHeight
  const loopStripHeight = rulerHeight - strip
  const fontSize = theme.control["--text-control-track"]
  const gap = theme.control["--spacing-control-gap"]
  const line = theme.colors.arrangementLine
  const width = size.width
  const waveHeight = Math.max(0, size.height - rulerHeight - strip)
  const toX = (bar: number) => ((bar - view.start) / view.span) * width
  const ticks = sourceTicks(view, sourceTickStep(view, width, fontSize * 8))
  const secondsPerBar =
    ((60 / settings.sourceBpm) * transport.numerator * 4) / transport.denominator
  const offset = clip.sourceOffsetBars ?? 0
  const extent = overviewExtent(range, view)
  const markerProps = { clip, view, width }
  const fadePaths = (["in", "out"] as const).flatMap(edge => {
    const length = edge === "in" ? (clip.fadeInBars ?? 0) : (clip.fadeOutBars ?? 0)
    if (length <= 0 || width <= 0 || waveHeight <= 0) return []
    const controls = fadeControls(clip, edge)
    const x0 = toX(offset + controls.start)
    const x1 = toX(offset + controls.end)
    const [y0, y1] = edge === "in" ? [waveHeight, 0] : [0, waveHeight]
    const segments = fadeBezierSegments(
      x0,
      y0,
      x1,
      y1,
      (edge === "in" ? clip.fadeInCurvePosition : clip.fadeOutCurvePosition) ?? 0.5,
      (edge === "in" ? clip.fadeInCurve : clip.fadeOutCurve) ?? DEFAULT_FADE_CURVE
    )
    return [{ d: cubicPath({ x: x0, y: y0 }, segments), strokeWidth: 1 }]
  })
  const wheel = (event: EventPayload) => {
    const dy = event.deltaY ?? 0
    const dx = event.deltaX ?? 0
    const bounds = surface.current && renderer?.getElementBounds?.(surface.current.id)
    if (event.modifiers?.cmd || event.modifiers?.ctrl) {
      const anchor = bounds ? ((event.x ?? bounds.x) - bounds.x) / Math.max(1, bounds.width) : 0.5
      setView(previous => zoomSource(previous, range, Math.exp(dy * 0.005), anchor))
    } else if (event.modifiers?.shift || dx) {
      setView(previous =>
        panSource(previous, range, (-(dx || dy) / Math.max(1, width)) * previous.span)
      )
    }
  }
  const rulerLabel = (left: number, text: string, top: number) => (
    <div
      key={`${top}-${left}`}
      style={sx({
        position: "absolute",
        left,
        top,
        height: strip,
        paddingLeft: gap,
        borderLeftWidth: 1,
        borderColor: line,
        color: theme.colors.mutedForeground,
        fontSize,
        pointerEvents: "none",
      })}
    >
      <text>{text}</text>
    </div>
  )
  const iconButton = (
    label: string,
    icon: Parameters<typeof Icon>[0]["name"],
    onClick: () => void,
    disabled = false
  ) => (
    <Button
      iconOnly
      label={label}
      disabled={disabled}
      onClick={onClick}
      icon={<Icon name={icon} />}
    />
  )
  const fileName = clip.samplePath
    ? (clip.samplePath.split(/[\\/]/).at(-1) ?? "")
    : labels.emptySource
  return (
    <div
      testId="audio-waveform"
      role="group"
      aria-label={labels.waveform}
      style={sx({
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
        minHeight: 0,
      })}
    >
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap,
          flexShrink: 0,
          paddingLeft: theme.control["--spacing-control-track-gap"],
          paddingRight: theme.control["--spacing-control-track-gap"],
          paddingTop: gap,
          paddingBottom: gap,
          borderBottomWidth: 1,
          borderColor: line,
        })}
      >
        <text style={{ color: theme.colors.foreground, fontSize, flexShrink: 1, minWidth: 0 }}>
          {fileName}
        </text>
        <div style={{ flexGrow: 1 }} />
        {iconButton(
          labels.panLeft,
          "ArrowLeft",
          () => setView(previous => panSource(previous, range, -previous.span / 4)),
          view.start <= extent.start
        )}
        {iconButton(labels.panRight, "ArrowRight", () =>
          setView(previous => panSource(previous, range, previous.span / 4))
        )}
        {iconButton(labels.zoomOut, "Minus", () =>
          setView(previous => zoomSource(previous, range, 0.5, 0.5))
        )}
        {iconButton(labels.zoomIn, "Plus", () =>
          setView(previous => zoomSource(previous, range, 2, 0.5))
        )}
        {iconButton(labels.fit, "Maximize2", () => setView(range))}
      </div>
      <div
        ref={surface}
        testId="audio-surface"
        style={sx({
          position: "relative",
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: theme.colors.arrangementSurface,
        })}
        onLayout={event => {
          if (event.width !== undefined && event.height !== undefined)
            setSize(previous =>
              previous.width === event.width && previous.height === event.height
                ? previous
                : { width: event.width ?? 0, height: event.height ?? 0 }
            )
        }}
        onScroll={wheel}
        onMouseDown={event => {
          const bounds = surface.current && renderer?.getElementBounds?.(surface.current.id)
          if (!bounds) return
          if (event.button === 1 || ((event.button ?? 0) === 0 && event.modifiers?.alt)) {
            drag.current = {
              kind: "pan",
              x: event.x ?? 0,
              start: view.start,
              scale: view.span / Math.max(1, width),
            }
          } else if ((event.button ?? 0) === 0) {
            setSelection(
              view.start + (((event.x ?? bounds.x) - bounds.x) / Math.max(1, width)) * view.span
            )
          }
        }}
        onMouseMove={event => {
          const active = drag.current
          if (active?.kind !== "pan") return
          setView(previous =>
            panSource(
              { ...previous, start: active.start },
              range,
              -((event.x ?? active.x) - active.x) * active.scale
            )
          )
        }}
        onMouseUp={() => {
          drag.current = null
        }}
      >
        <div
          role="group"
          aria-label={labels.musicalRuler}
          style={sx({
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: strip,
            borderBottomWidth: 1,
            borderColor: line,
            pointerEvents: "none",
          })}
        >
          {ticks.map(value =>
            rulerLabel(
              toX(value),
              formatAudioMusicalValue(
                value,
                transport.numerator,
                transport.denominator,
                "position"
              ),
              0
            )
          )}
        </div>
        <div
          style={sx({
            position: "absolute",
            left: 0,
            right: 0,
            top: strip,
            height: loopStripHeight,
            borderBottomWidth: 1,
            borderColor: line,
            pointerEvents: "none",
          })}
        >
          <div
            testId="audio-loop-range"
            role="img"
            aria-label={settings.loop ? labels.loopWindow : labels.loopWindowOff}
            style={sx({
              position: "absolute",
              left: toX(settings.loopStartBars),
              width: (settings.loopLengthBars / view.span) * width,
              top: gap,
              bottom: gap,
              backgroundColor: settings.loop
                ? colorMix(theme.colors.primary, 45, "transparent")
                : theme.colors.muted,
              borderWidth: 1,
              borderColor: settings.loop ? theme.colors.primary : theme.colors.mutedForeground,
              pointerEvents: "none",
            })}
          />
          <SourceMarker
            {...markerProps}
            kind="loopStart"
            position={settings.loopStartBars}
            height={loopStripHeight}
            label={labels.loopStart}
          />
          <SourceMarker
            {...markerProps}
            kind="loopEnd"
            position={markerPosition(clip, "loopEnd", transport.bpm)}
            height={loopStripHeight}
            label={labels.loopEnd}
          />
        </div>
        <div
          style={sx({
            position: "absolute",
            left: 0,
            right: 0,
            top: rulerHeight,
            height: waveHeight,
            overflow: "hidden",
            pointerEvents: "none",
          })}
        >
          {ticks.map(value => (
            <div
              key={value}
              style={sx({
                position: "absolute",
                left: toX(value),
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: line,
                pointerEvents: "none",
              })}
            />
          ))}
          <div
            style={sx({
              position: "absolute",
              left: 0,
              right: 0,
              top: waveHeight / 2,
              height: 1,
              backgroundColor: theme.colors.mutedForeground,
              opacity: 0.4,
              pointerEvents: "none",
            })}
          />
          {clip.samplePath ? (
            <SourceWaveform
              testId="audio-peaks"
              sourceId={clip.samplePath}
              view={view}
              window={{ start: offset, end: offset + clip.lengthBars }}
              width={width}
              height={waveHeight}
              gain={10 ** (clip.gainDb / 20)}
              reverse={settings.reverse}
              color={color}
              readPeaks={readPeaks}
            />
          ) : (
            <div
              style={sx({
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              })}
            >
              <text style={{ color: theme.colors.mutedForeground, fontSize }}>
                {labels.emptySource}
              </text>
            </div>
          )}
          {fadePaths.length ? (
            <Shape
              width={width}
              height={waveHeight}
              paths={fadePaths}
              color={theme.colors.primary}
              style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
            />
          ) : null}
          {selection !== null ? (
            <div
              testId="audio-selection"
              style={sx({
                position: "absolute",
                left: toX(selection),
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: theme.colors.primary,
                pointerEvents: "none",
              })}
            />
          ) : null}
          <SourceMarker
            {...markerProps}
            kind="start"
            position={settings.startMarkerBars}
            height={waveHeight}
            label={labels.sourceStart}
          />
          <SourceMarker
            {...markerProps}
            kind="end"
            position={settings.endMarkerBars}
            height={waveHeight}
            label={labels.sourceEnd}
          />
          <SourceMarker
            {...markerProps}
            kind="fadeIn"
            lower
            position={markerPosition(clip, "fadeIn", transport.bpm)}
            height={waveHeight}
            label={labels.fadeInMarker}
          />
          <SourceMarker
            {...markerProps}
            kind="fadeOut"
            lower
            position={markerPosition(clip, "fadeOut", transport.bpm)}
            height={waveHeight}
            label={labels.fadeOutMarker}
          />
        </div>
        <div
          role="group"
          aria-label={labels.timeRuler}
          style={sx({
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: strip,
            borderTopWidth: 1,
            borderColor: line,
            pointerEvents: "none",
          })}
        >
          {ticks.map(value => rulerLabel(toX(value), timeTickLabel(value * secondsPerBar), 0))}
        </div>
      </div>
      <div
        ref={overview}
        testId="audio-overview"
        role="slider"
        tabIndex={0}
        aria-label={labels.overview}
        aria-valuenow={view.start}
        aria-valuetext={view.start.toFixed(3)}
        style={sx({
          position: "relative",
          flexShrink: 0,
          height: strip,
          overflow: "hidden",
          cursor: "ew-resize",
          borderTopWidth: 1,
          borderColor: line,
          keyboardFocusDim: false,
          focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
        })}
        onKeyDown={event => {
          if (event.key !== "left" && event.key !== "right") return
          event.preventDefault()
          event.stopPropagation()
          setView(previous =>
            panSource(previous, range, (previous.span / 4) * (event.key === "left" ? -1 : 1))
          )
        }}
        onMouseDown={event => {
          if ((event.button ?? 0) !== 0) return
          if ((event.clickCount ?? 1) >= 2) {
            setView(range)
            return
          }
          const bounds = overview.current && renderer?.getElementBounds?.(overview.current.id)
          if (!bounds) return
          const scale = extent.span / Math.max(1, bounds.width)
          const clicked = extent.start + ((event.x ?? bounds.x) - bounds.x) * scale
          const start =
            clicked >= view.start && clicked <= view.start + view.span
              ? view.start
              : Math.max(
                  extent.start,
                  Math.min(extent.start + extent.span - view.span, clicked - view.span / 2)
                )
          setView(previous => ({ ...previous, start }))
          drag.current = { kind: "overview", x: event.x ?? 0, start, scale }
        }}
        onMouseMove={event => {
          const active = drag.current
          if (active?.kind !== "overview") return
          setView(previous => ({
            ...previous,
            start: Math.max(
              extent.start,
              Math.min(
                extent.start + extent.span - previous.span,
                active.start + ((event.x ?? active.x) - active.x) * active.scale
              )
            ),
          }))
        }}
        onMouseUp={() => {
          drag.current = null
        }}
      >
        {clip.samplePath ? (
          <SourceWaveform
            sourceId={clip.samplePath}
            view={extent}
            window={{ start: offset, end: offset + clip.lengthBars }}
            width={width}
            height={strip}
            gain={1}
            reverse={settings.reverse}
            color={theme.colors.mutedForeground}
            readPeaks={readPeaks}
          />
        ) : null}
        <div
          testId="audio-overview-frame"
          style={sx({
            position: "absolute",
            top: 0,
            bottom: 0,
            left: ((view.start - extent.start) / extent.span) * width,
            width: (view.span / extent.span) * width,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            backgroundColor: colorMix(theme.colors.primary, 12, "transparent"),
            pointerEvents: "none",
          })}
        />
      </div>
      <div
        style={sx({
          display: "flex",
          flexDirection: "row",
          gap: theme.control["--spacing-control-track-gap"],
          flexShrink: 0,
          paddingLeft: theme.control["--spacing-control-track-gap"],
          color: theme.colors.mutedForeground,
          fontSize,
        })}
      >
        <text>{`${labels.zoom} ${(clip.lengthBars / view.span).toFixed(1)}×`}</text>
        <text>{`${labels.selection}: ${selection === null ? "—" : timeTickLabel(selection * secondsPerBar)}`}</text>
      </div>
    </div>
  )
}
