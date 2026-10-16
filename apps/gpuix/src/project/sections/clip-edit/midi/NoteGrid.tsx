import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { useMemo } from "react"
import type { Ref } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { pitchName } from "./geometry"
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
  readonly color: string
  readonly onLayout: (event: EventPayload) => void
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
  readonly onKeyDown: (event: KeyEvent) => void
  readonly onBlur: () => void
}) {
  const theme = useTheme()
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
        `${note.startBeat}–${note.startBeat + note.lengthBeats} · ${note.velocity}/127${selected.has(rect.index) ? " *" : ""}`
      )
      row.selected ||= selected.has(rect.index)
    }
    return Array.from(descriptions, ([pitch, row]) => ({
      pitch,
      top: row.top,
      selected: row.selected,
      description: row.notes.join("; "),
    }))
  }, [rects, notes, selected])
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
        design: theme.design,
        project: theme.project,
      }),
    [
      notes,
      rects,
      roll,
      selected,
      numerator,
      color,
      theme.colors,
      theme.design,
      theme.project,
      fontSize,
    ]
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
        cursor: drawMode ? theme.design.cursors.action : theme.design.cursors.default,
        backgroundColor: theme.colors.arrangementSurface,
        keyboardFocusDim: false,
        focusVisible: {
          outlineWidth: theme.design.shape.focusRingWidth,
          outlineColor: theme.colors.ring,
          outlineOffset: -theme.design.shape.focusRingWidth,
        },
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
              aria-label={`${pitchName(note.pitch)} · ${note.startBeat}–${note.startBeat + note.lengthBeats} · ${note.velocity}/127`}
              aria-selected={selected.has(rect.index)}
              style={sx({
                position: "absolute",
                left: rect.left - roll.scrollX,
                top: rect.top - roll.scrollY + theme.design.editor.noteInset,
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height - theme.design.editor.noteInset),
                overflow: "hidden",
                borderWidth: theme.design.shape.controlBorderWidth,
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
          aria-label={`${pitchName(activeNote.pitch)} · ${activeNote.startBeat}–${activeNote.startBeat + activeNote.lengthBeats} · ${activeNote.velocity}/127`}
          style={{
            position: "absolute",
            left: activeRect.left - roll.scrollX,
            top: activeRect.top - roll.scrollY + theme.design.editor.noteInset,
            width: Math.max(1, activeRect.width),
            height: Math.max(1, activeRect.height - theme.design.editor.noteInset),
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
            borderWidth: theme.design.editor.selectionStrokeWidth,
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.editorMarquee,
            pointerEvents: "none",
          })}
        />
      ) : null}
    </div>
  )
}
