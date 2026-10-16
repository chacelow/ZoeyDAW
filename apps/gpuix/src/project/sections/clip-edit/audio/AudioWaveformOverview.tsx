import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { SourceWaveform } from "./SourceWaveform"
import type { PublicInstance } from "@gpuix/react"
import type { RefObject } from "react"
import type { AudioClipSettings } from "@/project/model/audio-editor"
import type { PeakReader } from "@/project/model/backend"
import type { AudioClip } from "@/project/model/types"
import type { AudioEditorLabels } from "../labels"
import type { SourceView } from "./source-view"

import type { AudioOverviewHandlers } from "./useAudioWaveformView"

export function AudioWaveformOverview({
  clip,
  settings,
  labels,
  view,
  extent,
  width,
  readPeaks,
  overview,
  handlers,
}: {
  clip: AudioClip
  settings: AudioClipSettings
  labels: AudioEditorLabels
  view: SourceView
  extent: SourceView
  width: number
  readPeaks: PeakReader
  overview: RefObject<PublicInstance | null>
  handlers: AudioOverviewHandlers
}) {
  const theme = useTheme()
  const strip = theme.control["--spacing-control-track"]
  const offset = clip.sourceOffsetBars ?? 0
  return (
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
        cursor: theme.design.cursors.horizontalResize,
        borderTopWidth: theme.design.editor.dividerStrokeWidth,
        borderColor: theme.colors.arrangementLine,
        keyboardFocusDim: false,
        focusVisible: {
          outlineWidth: theme.design.shape.focusRingWidth,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.shape.focusRingWidth,
        },
      })}
      {...handlers}
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
          borderWidth: theme.design.editor.selectionStrokeWidth,
          borderColor: theme.colors.primary,
          backgroundColor: theme.colors.editorOverviewViewport,
          pointerEvents: "none",
        })}
      />
    </div>
  )
}
