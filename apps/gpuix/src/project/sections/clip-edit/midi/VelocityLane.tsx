import type { EventPayload, PublicInstance } from "@gpuix/react"
import type { Ref } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"

/**
Per-note velocity stems under the roll, sharing its horizontal scroll. One host captures the
pointer; stems in view are mounted, and a stem's handle height is its velocity.
*/
export function VelocityLane({
  hostRef,
  roll,
  notes,
  selection,
  label,
  color,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: {
  readonly hostRef: Ref<PublicInstance | null>
  readonly roll: RollGeometry
  readonly notes: readonly MidiNote[]
  readonly selection: readonly number[]
  readonly label: string
  readonly color: string
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
}) {
  const theme = useTheme()
  const height = theme.project.midiVelocityHeight
  const handle = theme.control["--spacing-control-gap"] * 2
  const { sourceOffsetBeats, totalBeats } = roll.window
  const selected = new Set(selection)
  return (
    <div
      ref={hostRef}
      testId="midi-velocity"
      role="group"
      aria-label={label}
      style={sx({
        position: "relative",
        flexGrow: 1,
        minWidth: 0,
        height,
        overflow: "hidden",
        cursor: "ns-resize",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      })}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {notes.map((note, index) => {
        if (
          note.startBeat >= sourceOffsetBeats + totalBeats ||
          note.startBeat + note.lengthBeats <= sourceOffsetBeats
        )
          return null
        const x =
          ((Math.max(note.startBeat, sourceOffsetBeats) - sourceOffsetBeats) / totalBeats) *
            roll.width -
          roll.scrollX
        if (x < -handle || x > roll.viewWidth + handle) return null
        const stem = (note.velocity / 127) * height
        const isSelected = selected.has(index)
        const tint = isSelected ? theme.colors.foreground : color
        return (
          <div
            key={note.id ?? index}
            testId={`midi-velocity-${note.id ?? index}`}
            role="img"
            aria-label={`${label} ${note.velocity}`}
            style={sx({
              position: "absolute",
              left: x,
              bottom: 0,
              height: stem,
              width: 1,
              pointerEvents: "none",
            })}
          >
            <div
              style={sx({
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 1,
                backgroundColor: tint,
              })}
            />
            <div
              style={sx({
                position: "absolute",
                left: -handle / 2,
                top: -handle / 2,
                width: handle,
                height: handle,
                backgroundColor: tint,
                pointerEvents: "none",
              })}
            />
          </div>
        )
      })}
    </div>
  )
}
