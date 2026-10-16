import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { useMemo } from "react"
import type { Ref } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { colorMix } from "@/shared/theme/color-mix"
import { usePreference } from "@/platform/settings"
import type { DisplayFormats } from "@/project/model/display-formats"
import { visibleNoteRects } from "./layout"
import { QuadPaint, usePaintLayers } from "./QuadPaint"
import { notePaint } from "./note-paint"
import type { MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"
import type { Marquee } from "./useMidiEditor"

/** One grid owns pointer capture, hit testing and edit shortcuts; quads are visual-only. */
export function NoteGrid({
  hostRef,
  roll,
  readNotes,
  selection,
  currentNoteIndex,
  marquee,
  numerator,
  drawMode,
  label,
  formats,
  color,
  onLayout,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onKeyDown,
  onBlur,
}: {
  readonly hostRef: Ref<PublicInstance | null>
  readonly roll: RollGeometry
  readonly readNotes: () => readonly MidiNote[]
  readonly selection: readonly number[]
  readonly currentNoteIndex: number | null
  readonly marquee: Marquee | null
  readonly numerator: number
  readonly drawMode: boolean
  readonly label: string
  readonly formats: DisplayFormats
  readonly color: string
  readonly onLayout: (event: EventPayload) => void
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
  readonly onKeyDown: (event: KeyEvent) => void
  readonly onBlur: () => void
}) {
  const theme = useTheme()
  const midi = usePreference("midi")
  const pitchName = (pitch: number) => formats.pitchName(pitch, midi.octaveLabelOffset)
  const notes = readNotes()
  const rects = useMemo(() => visibleNoteRects(notes, roll), [notes, roll])
  const selected = useMemo(() => new Set(selection), [selection])
  const fontSize = theme.control["--text-control-track"]
  const activeRect = rects.find(rect => rect.index === currentNoteIndex)
  const activeNote = activeRect ? notes[activeRect.index] : undefined
  const rows = useMemo(() => {
    const descriptions = new Map<number, { top: number; notes: string[]; selected: boolean }>()
    for (const rect of rects) {
      const note = notes[rect.index]
      if (!note) continue
      let row = descriptions.get(note.pitch)
      if (!row) {
        row = { top: rect.top, notes: [], selected: false }
        descriptions.set(note.pitch, row)
      }
      row.notes.push(
        `${formats.number(note.startBeat, "midi")}–${formats.number(note.startBeat + note.lengthBeats, "midi")} · ${formats.number(note.velocity, "integer")}/127${selected.has(rect.index) ? " *" : ""}`
      )
      row.selected ||= selected.has(rect.index)
    }
    return Array.from(descriptions, ([pitch, row]) => ({
      pitch,
      top: row.top,
      selected: row.selected,
      description: row.notes.join("; "),
    }))
  }, [rects, notes, selected, formats])
  const paint = useMemo(
    () =>
      notePaint({
        notes,
        rects,
        roll,
        selected,
        numerator,
        color,
        colors: theme.colors,
        fontSize,
        gridBeats: midi.noteGridBeats,
      }),
    [notes, rects, roll, selected, numerator, color, theme.colors, fontSize, midi.noteGridBeats]
  )
  const layers = useMemo(
    () => [...paint.background, ...paint.planes.flatMap(plane => plane.layers)],
    [paint]
  )
  const bind = usePaintLayers(layers)
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
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {paint.background.map(layer => (
        <QuadPaint
          key={layer.key}
          id={layer.key}
          color={layer.color}
          opacity={layer.opacity}
          strokeWidth={layer.strokeWidth}
          strokeColor={layer.strokeColor}
          bind={bind}
          width={roll.viewWidth}
          height={roll.viewHeight}
        />
      ))}
      {rows.map(row => (
        <div
          key={`row-${row.pitch}`}
          testId={`midi-note-row-${row.pitch}`}
          role="row"
          aria-label={`${pitchName(row.pitch)} · ${row.description}`}
          aria-selected={row.selected}
          style={{
            position: "absolute",
            left: 0,
            top: row.top - roll.scrollY,
            width: roll.viewWidth,
            height: roll.rowHeight,
            pointerEvents: "none",
          }}
        />
      ))}
      {paint.planes.flatMap(plane => [
        ...plane.layers.map(layer => (
          <QuadPaint
            key={layer.key}
            id={layer.key}
            color={layer.color}
            opacity={layer.opacity}
            strokeWidth={layer.strokeWidth}
            strokeColor={layer.strokeColor}
            bind={bind}
            width={roll.viewWidth}
            height={roll.viewHeight}
          />
        )),
        ...plane.labels.map(rect => {
          const note = notes[rect.index]
          if (!note) return null
          return (
            <div
              key={note.id ?? rect.index}
              testId={`midi-note-${note.id ?? rect.index}`}
              role="gridcell"
              aria-label={`${pitchName(note.pitch)} · ${formats.number(note.startBeat, "midi")}–${formats.number(note.startBeat + note.lengthBeats, "midi")} · ${formats.number(note.velocity, "integer")}/127`}
              aria-selected={selected.has(rect.index)}
              style={sx({
                position: "absolute",
                left: rect.left - roll.scrollX,
                top: rect.top - roll.scrollY + 1,
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height - 1),
                overflow: "hidden",
                borderWidth: 1,
                borderColor: rect.border,
                backgroundColor: rect.fill,
                color:
                  theme.appearance === "dark" ? theme.colors.background : theme.colors.foreground,
                fontSize,
                pointerEvents: "none",
              })}
            >
              <text style={{ pointerEvents: "none" }}>{pitchName(note.pitch)}</text>
            </div>
          )
        }),
      ])}
      {activeRect &&
      activeNote &&
      !(activeRect.width > fontSize * 3 && activeRect.height > fontSize) ? (
        <div
          testId={`midi-note-${activeNote.id ?? activeRect.index}`}
          role="gridcell"
          aria-selected
          aria-label={`${pitchName(activeNote.pitch)} · ${formats.number(activeNote.startBeat, "midi")}–${formats.number(activeNote.startBeat + activeNote.lengthBeats, "midi")} · ${formats.number(activeNote.velocity, "integer")}/127`}
          style={{
            position: "absolute",
            left: activeRect.left - roll.scrollX,
            top: activeRect.top - roll.scrollY + 1,
            width: Math.max(1, activeRect.width),
            height: Math.max(1, activeRect.height - 1),
            pointerEvents: "none",
          }}
        />
      ) : null}
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
