import { formatAudioMusicalValue } from "@/project/model/audio-editor"
import { timeTickLabel } from "@/project/model/timeline-ticks"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { SourceMarker } from "./SourceMarker"
import { markerPosition } from "./markers"
import type { AudioClipSettings } from "@/project/model/audio-editor"
import type { AudioClip } from "@/project/model/types"
import type { AudioEditorLabels } from "../labels"
import type { SourceView } from "./source-view"
import type { ReactNode } from "react"

export function AudioWaveformRulers({
  clip,
  settings,
  labels,
  view,
  width,
  numerator,
  denominator,
  bpm,
  secondsPerBar,
  ticks,
  children,
}: {
  clip: AudioClip
  settings: AudioClipSettings
  labels: AudioEditorLabels
  view: SourceView
  width: number
  numerator: number
  denominator: number
  bpm: number
  secondsPerBar: number
  ticks: readonly number[]
  children: ReactNode
}) {
  const theme = useTheme()
  const strip = theme.control["--spacing-control-track"]
  const rulerHeight = theme.project.audioRulerHeight
  const gap = theme.control["--spacing-control-gap"]
  const fontSize = theme.control["--text-control-track"]
  const line = theme.colors.arrangementLine
  const toX = (bar: number) => ((bar - view.start) / view.span) * width
  const rulerLabel = (left: number, text: string) => (
    <div
      key={left}
      style={sx({
        position: "absolute",
        left,
        top: 0,
        height: strip,
        paddingLeft: gap,
        borderLeftWidth: theme.design.editor.gridMinorStrokeWidth,
        borderColor: line,
        color: theme.colors.mutedForeground,
        fontSize,
        pointerEvents: "none",
      })}
    >
      <text>{text}</text>
    </div>
  )
  const markerProps = { clip, view, width }
  return (
    <>
      <div
        role="group"
        aria-label={labels.musicalRuler}
        style={sx({
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: strip,
          borderBottomWidth: theme.design.editor.dividerStrokeWidth,
          borderColor: line,
          pointerEvents: "none",
        })}
      >
        {ticks.map(value =>
          rulerLabel(toX(value), formatAudioMusicalValue(value, numerator, denominator, "position"))
        )}
      </div>
      <div
        style={sx({
          position: "absolute",
          left: 0,
          right: 0,
          top: strip,
          height: rulerHeight - strip,
          borderBottomWidth: theme.design.editor.dividerStrokeWidth,
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
            backgroundColor: settings.loop ? theme.colors.editorAudioLoop : theme.colors.muted,
            borderWidth: theme.design.editor.loopStrokeWidth,
            borderColor: settings.loop ? theme.colors.primary : theme.colors.mutedForeground,
            pointerEvents: "none",
          })}
        />
        <SourceMarker
          {...markerProps}
          kind="loopStart"
          position={settings.loopStartBars}
          height={rulerHeight - strip}
          label={labels.loopStart}
        />
        <SourceMarker
          {...markerProps}
          kind="loopEnd"
          position={markerPosition(clip, "loopEnd", bpm)}
          height={rulerHeight - strip}
          label={labels.loopEnd}
        />
      </div>
      {children}
      <div
        role="group"
        aria-label={labels.timeRuler}
        style={sx({
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: strip,
          borderTopWidth: theme.design.editor.dividerStrokeWidth,
          borderColor: line,
          pointerEvents: "none",
        })}
      >
        {ticks.map(value => rulerLabel(toX(value), timeTickLabel(value * secondsPerBar)))}
      </div>
    </>
  )
}
