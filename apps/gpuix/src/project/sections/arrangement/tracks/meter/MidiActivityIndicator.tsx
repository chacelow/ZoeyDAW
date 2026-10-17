import { useProjectState } from "@/project/adapters"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { useTrackLabels } from "../labels"

export function MidiActivityIndicator({
  trackId,
  trackName,
  height,
  collapsed,
}: {
  readonly trackId: string
  readonly trackName: string
  readonly height: number
  readonly collapsed: boolean
}) {
  const theme = useTheme()
  const { t } = useTrackLabels()
  const activeNotes = useProjectState(state => state.session.activeMidiNotes)
  const unit = theme.control["--spacing-control-track"]
  const meter = theme.design.editor.meter
  const barWidth = (collapsed ? meter.collapsedWidthUnits : meter.trackWidthUnits) * unit
  const showTicks = !collapsed && height >= meter.ticksMinHeightUnits * unit
  const width = barWidth + (showTicks ? meter.tickWidth + meter.tickGap : 0)
  const dotSize = theme.control["--spacing-control-track-gap"]
  const rows = Math.floor(height / (dotSize * 2))
  const columns = Math.floor(barWidth / (dotSize * 2))
  const activeCount = Math.min(activeNotes.length, rows * columns)
  return (
    <div
      role="meter"
      aria-label={`${t("midiActivity")} ${trackName}`}
      aria-valuemin={0}
      aria-valuemax={rows * columns}
      aria-valuenow={activeCount}
      testId={`track-midi-activity-${trackId}`}
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gridTemplateRows: rows,
        gap: dotSize,
        width,
        height,
        flexShrink: 0,
        alignContent: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: rows * columns }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: theme.design.shape.indicatorRadius,
            backgroundColor:
              index < activeCount ? theme.colors.arrangementMeterWarn : theme.colors.muted,
          }}
        />
      ))}
    </div>
  )
}
