import { fadeBezierSegments, fadeControls } from "@/project/model/fades"
import { PROJECT_TEMPLATE } from "@/project/defaults/template"
import { Shape } from "@/shared/svg/Shape"
import { cubicPath } from "@/shared/svg/paths"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { SourceMarker } from "./SourceMarker"
import { SourceWaveform } from "./SourceWaveform"
import { markerPosition } from "./markers"
import type { AudioClipSettings } from "@/project/model/audio-editor"
import type { PeakReader } from "@/project/model/backend"
import type { AudioClip } from "@/project/model/types"
import type { AudioEditorLabels } from "../labels"
import type { SourceView } from "./source-view"

export function AudioWaveformLayer({
  clip,
  settings,
  labels,
  view,
  width,
  height,
  selection,
  color,
  readPeaks,
  bpm,
  ticks,
}: {
  clip: AudioClip
  settings: AudioClipSettings
  labels: AudioEditorLabels
  view: SourceView
  width: number
  height: number
  selection: number | null
  color: string
  readPeaks: PeakReader
  bpm: number
  ticks: readonly number[]
}) {
  const theme = useTheme()
  const fontSize = theme.control["--text-control-track"]
  const line = theme.colors.arrangementLine
  const offset = clip.sourceOffsetBars ?? 0
  const toX = (bar: number) => ((bar - view.start) / view.span) * width
  const fadePaths = (["in", "out"] as const).flatMap(edge => {
    const length =
      (edge === "in" ? clip.fadeInBars : clip.fadeOutBars) ??
      PROJECT_TEMPLATE.clip.fade.durationBars
    if (length <= 0 || width <= 0 || height <= 0) return []
    const controls = fadeControls(clip, edge)
    const x0 = toX(offset + controls.start)
    const x1 = toX(offset + controls.end)
    const [y0, y1] = edge === "in" ? [height, 0] : [0, height]
    const segments = fadeBezierSegments(
      x0,
      y0,
      x1,
      y1,
      (edge === "in" ? clip.fadeInCurvePosition : clip.fadeOutCurvePosition) ??
        PROJECT_TEMPLATE.clip.fade.position,
      (edge === "in" ? clip.fadeInCurve : clip.fadeOutCurve) ?? PROJECT_TEMPLATE.clip.fade.curve
    )
    return [
      {
        d: cubicPath({ x: x0, y: y0 }, segments),
        strokeWidth: theme.design.editor.fadeStrokeWidth,
      },
    ]
  })
  const markerProps = { clip, view, width, formats: labels.formats }
  return (
    <div
      style={sx({
        position: "absolute",
        left: 0,
        right: 0,
        top: theme.project.audioRulerHeight,
        height,
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
            width: theme.design.editor.gridMinorStrokeWidth,
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
          top: height / 2,
          height: theme.design.editor.dividerStrokeWidth,
          backgroundColor: theme.colors.mutedForeground,
          opacity: theme.design.editor.waveformAxisOpacity,
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
          height={height}
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
          height={height}
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
            width: theme.design.editor.selectionLineWidth,
            backgroundColor: theme.colors.primary,
            pointerEvents: "none",
          })}
        />
      ) : null}
      <SourceMarker
        {...markerProps}
        kind="start"
        position={settings.startMarkerBars}
        height={height}
        label={labels.sourceStart}
      />
      <SourceMarker
        {...markerProps}
        kind="end"
        position={settings.endMarkerBars}
        height={height}
        label={labels.sourceEnd}
      />
      <SourceMarker
        {...markerProps}
        kind="fadeIn"
        lower
        position={markerPosition(clip, "fadeIn", bpm)}
        height={height}
        label={labels.fadeInMarker}
      />
      <SourceMarker
        {...markerProps}
        kind="fadeOut"
        lower
        position={markerPosition(clip, "fadeOut", bpm)}
        height={height}
        label={labels.fadeOutMarker}
      />
    </div>
  )
}
