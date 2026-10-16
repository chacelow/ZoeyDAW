import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { MIN_GRID_CELL_PX } from "@/project/model/grid"
import { rollGridLines } from "./layout"
import type { RollGeometry } from "./layout"

/**
Source-window strip with loop boundary marks above bar.beat labels. Like Live's Clip ruler, labels
are one-based musical positions inside the retained source; only labels in view are mounted.
*/
export function MidiRuler({
  roll,
  numerator,
  loopBeats,
  labels,
}: {
  readonly roll: RollGeometry
  readonly numerator: number
  readonly loopBeats: number
  readonly labels: { readonly sourceWindow: string; readonly loopBoundary: string }
}) {
  const theme = useTheme()
  const height = theme.project.midiRulerHeight
  const strip = theme.control["--spacing-control-track"]
  const fontSize = theme.control["--text-control-track"]
  const labelGap = theme.control["--spacing-control-gap"]
  const { sourceOffsetBeats, totalBeats } = roll.window
  // Label every line that has room for "bar.beat"; otherwise only bars.
  const labelled = rollGridLines(roll, numerator, fontSize * 4).filter(line => line.level > 0)
  const beatPx = roll.width / totalBeats
  const loopStep = loopBeats * Math.max(1, Math.ceil((MIN_GRID_CELL_PX * 3) / (loopBeats * beatPx)))
  const loops: number[] = []
  for (
    let beat = Math.ceil(sourceOffsetBeats / loopStep) * loopStep;
    beat < sourceOffsetBeats + totalBeats && loops.length < 256;
    beat += loopStep
  ) {
    const x = ((beat - sourceOffsetBeats) / totalBeats) * roll.width - roll.scrollX
    if (x >= 0 && x <= roll.viewWidth) loops.push(x)
  }
  return (
    <div
      testId="midi-ruler"
      role="group"
      aria-label={`${labels.sourceWindow} ${sourceOffsetBeats.toFixed(2)}–${(sourceOffsetBeats + totalBeats).toFixed(2)}`}
      style={sx({
        position: "relative",
        height,
        flexGrow: 1,
        minWidth: 0,
        overflow: "hidden",
        borderBottomWidth: theme.design.editor.dividerStrokeWidth,
        borderColor: theme.colors.arrangementLine,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      })}
    >
      <div
        style={sx({
          position: "absolute",
          left: -roll.scrollX,
          top: 0,
          width: roll.width,
          height: strip,
          backgroundColor: theme.colors.primary,
          opacity: theme.design.editor.midiLoopOpacity,
        })}
      />
      {loops.map(x => (
        <div
          key={x}
          role="img"
          aria-label={labels.loopBoundary}
          style={sx({
            position: "absolute",
            left: x,
            top: 0,
            width: theme.design.editor.loopLineWidth,
            height: strip,
            backgroundColor: theme.colors.primary,
          })}
        />
      ))}
      {labelled.map(line => {
        const beat = sourceOffsetBeats + (line.x / roll.width) * totalBeats
        const bar = Math.floor(beat / numerator) + 1
        const inBar = Math.round(beat - (bar - 1) * numerator) + 1
        return (
          <div
            key={line.x}
            style={sx({
              position: "absolute",
              left: line.x - roll.scrollX,
              top: strip,
              bottom: 0,
              paddingLeft: labelGap,
              borderLeftWidth: theme.design.editor.dividerStrokeWidth,
              borderColor: theme.colors.arrangementLine,
              color: theme.colors.mutedForeground,
              fontSize,
            })}
          >
            <text>{line.level === 2 ? `${bar}` : `${bar}.${inBar}`}</text>
          </div>
        )
      })}
    </div>
  )
}
