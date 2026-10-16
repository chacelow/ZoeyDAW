import { useProjectState } from "@/project/adapters"
import { getAudioClipSettings } from "@/project/model/audio-editor"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import { AudioWaveformLayer } from "./AudioWaveformLayer"
import { AudioWaveformOverview } from "./AudioWaveformOverview"
import { AudioWaveformRulers } from "./AudioWaveformRulers"
import { useAudioWaveformView } from "./useAudioWaveformView"
import { sourceTicks, sourceTickStep } from "./source-view"
import type { PeakReader } from "@/project/model/backend"
import type { AudioClip } from "@/project/model/types"
import type { AudioEditorLabels } from "../labels"

/** Source view of an audio clip: rulers, loop strip, envelope and overview. */
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
  const transport = useProjectState(state => state.document.transport)
  const settings = getAudioClipSettings(clip, transport.bpm)
  const owner = useAudioWaveformView(clip, settings)
  const { view, size, selection, extent } = owner
  const strip = theme.control["--spacing-control-track"]
  const rulerHeight = theme.project.audioRulerHeight
  const fontSize = theme.control["--text-control-track"]
  const gap = theme.control["--spacing-control-gap"]
  const line = theme.colors.arrangementLine
  const width = size.width
  const ticks = sourceTicks(view, sourceTickStep(view, width, fontSize * 8))
  const waveHeight = Math.max(0, size.height - rulerHeight - strip)
  const secondsPerBar =
    ((60 / settings.sourceBpm) * transport.numerator * 4) / transport.denominator
  const fileName = clip.samplePath
    ? (clip.samplePath.split(/[\\/]/).at(-1) ?? "")
    : labels.emptySource
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
          () => owner.pan(-0.25),
          view.start <= extent.start
        )}
        {iconButton(labels.panRight, "ArrowRight", () => owner.pan(0.25))}
        {iconButton(labels.zoomOut, "Minus", () => owner.zoom(0.5))}
        {iconButton(labels.zoomIn, "Plus", () => owner.zoom(2))}
        {iconButton(labels.fit, "Maximize2", owner.fit)}
      </div>
      <div
        ref={owner.surface}
        testId="audio-surface"
        style={sx({
          position: "relative",
          flexGrow: 1,
          minHeight: 0,
          overflow: "hidden",
          backgroundColor: theme.colors.arrangementSurface,
        })}
        {...owner.surfaceHandlers}
      >
        <AudioWaveformRulers
          clip={clip}
          settings={settings}
          labels={labels}
          view={view}
          width={width}
          numerator={transport.numerator}
          denominator={transport.denominator}
          bpm={transport.bpm}
          secondsPerBar={secondsPerBar}
          ticks={ticks}
        >
          <AudioWaveformLayer
            clip={clip}
            settings={settings}
            labels={labels}
            view={view}
            width={width}
            height={waveHeight}
            selection={selection}
            color={color}
            readPeaks={readPeaks}
            bpm={transport.bpm}
            ticks={ticks}
          />
        </AudioWaveformRulers>
      </div>
      <AudioWaveformOverview
        clip={clip}
        settings={settings}
        labels={labels}
        view={view}
        extent={extent}
        width={width}
        readPeaks={readPeaks}
        overview={owner.overview}
        handlers={owner.overviewHandlers}
      />
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
        <text>{`${labels.zoom} ${labels.formats.zoom(clip.lengthBars / view.span)}`}</text>
        <text>{`${labels.selection}: ${selection === null ? labels.unavailable : labels.formats.duration(selection * secondsPerBar, "ruler")}`}</text>
      </div>
    </div>
  )
}
