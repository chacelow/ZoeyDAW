import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import type { Ref } from "react"
import { MIN_GRID_CELL_PX } from "@/project/model/grid"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { colorMix } from "@/shared/theme/color-mix"
import { isBlackKey, pitchName } from "./geometry"
import { rollGridLines, visibleNoteRects, visibleRows } from "./layout"
import type { MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"
import type { Marquee } from "./useMidiEditor"

/**
The focusable note surface. It owns pointer capture for every grid gesture (one host with
mouseDown + mouseMove), and mounts only rows, lines and notes that intersect the viewport.
*/
export function NoteGrid({
  hostRef,
  roll,
  notes,
  selection,
  marquee,
  numerator,
  drawMode,
  label,
  color,
  onLayout,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onScroll,
  onKeyDown,
  onBlur,
}: {
  readonly hostRef: Ref<PublicInstance | null>
  readonly roll: RollGeometry
  readonly notes: readonly MidiNote[]
  readonly selection: readonly number[]
  readonly marquee: Marquee | null
  readonly numerator: number
  readonly drawMode: boolean
  readonly label: string
  readonly color: string
  readonly onLayout: (event: EventPayload) => void
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
  readonly onScroll: (event: EventPayload) => void
  readonly onKeyDown: (event: KeyEvent) => void
  readonly onBlur: () => void
}) {
  const theme = useTheme()
  const { first, end } = visibleRows(roll)
  const rows = roll.pitches.slice(first, end)
  const lines = rollGridLines(roll, numerator, MIN_GRID_CELL_PX)
  const rects = visibleNoteRects(notes, roll)
  const selected = new Set(selection)
  const lineColor = theme.colors.arrangementLine
  const fontSize = theme.control["--text-control-track"]
  return (
    <div
      ref={hostRef}
      testId="midi-grid"
      role="grid"
      tabIndex={0}
      aria-label={label}
      style={sx({
        position: "relative",
        flexGrow: 1,
        minWidth: 0,
        height: "100%",
        overflow: "hidden",
        cursor: drawMode ? "pointer" : "default",
        backgroundColor: theme.colors.arrangementSurface,
        keyboardFocusDim: false,
        focusVisible: { outlineWidth: 1, outlineColor: theme.colors.ring, outlineOffset: -1 },
      })}
      onLayout={onLayout}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {rows.map((pitch, offset) => (
        <div
          key={pitch}
          style={sx({
            position: "absolute",
            left: 0,
            right: 0,
            top: (first + offset) * roll.rowHeight - roll.scrollY,
            height: roll.rowHeight,
            borderBottomWidth: 1,
            borderColor: lineColor,
            backgroundColor: isBlackKey(pitch) ? theme.colors.arrangementSurfaceAlt : undefined,
            pointerEvents: "none",
          })}
        />
      ))}
      {lines.map(line => (
        <div
          key={line.x}
          style={sx({
            position: "absolute",
            left: line.x - roll.scrollX,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: line.level === 2 ? theme.colors.mutedForeground : lineColor,
            opacity: line.level === 2 ? 0.45 : line.level === 1 ? 1 : 0.55,
            pointerEvents: "none",
          })}
        />
      ))}
      {rects.map(rect => {
        const note = notes[rect.index]
        if (!note) return null
        const isSelected = selected.has(rect.index)
        return (
          <div
            key={note.id ?? rect.index}
            testId={`midi-note-${note.id ?? rect.index}`}
            role="gridcell"
            aria-label={`${pitchName(note.pitch)} · ${note.velocity}`}
            aria-selected={isSelected}
            style={sx({
              position: "absolute",
              left: rect.left - roll.scrollX,
              top: rect.top - roll.scrollY + 1,
              width: Math.max(1, rect.width),
              height: Math.max(1, rect.height - 1),
              overflow: "hidden",
              borderWidth: 1,
              borderColor: isSelected
                ? theme.colors.foreground
                : colorMix(color, 60, theme.colors.background),
              // Velocity reads as fill strength, as in Live's piano roll.
              backgroundColor: isSelected
                ? colorMix(color, 55 + (note.velocity / 127) * 45, theme.colors.foreground)
                : colorMix(color, 35 + (note.velocity / 127) * 65, theme.colors.arrangementSurface),
              color:
                theme.appearance === "dark" ? theme.colors.background : theme.colors.foreground,
              fontSize,
              pointerEvents: "none",
            })}
          >
            {rect.width > fontSize * 3 && rect.height > fontSize ? (
              <text style={{ pointerEvents: "none" }}>{pitchName(note.pitch)}</text>
            ) : null}
          </div>
        )
      })}
      {marquee ? (
        <div
          testId="midi-marquee"
          style={sx({
            position: "absolute",
            left: marquee.left - roll.scrollX,
            top: marquee.top - roll.scrollY,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            backgroundColor: colorMix(theme.colors.primary, 20, "transparent"),
            pointerEvents: "none",
          })}
        />
      ) : null}
    </div>
  )
}
