import { useGpuix } from "@gpuix/react"
import type { EventPayload, PublicInstance } from "@gpuix/react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Ref } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import type { MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"
import { pitchName } from "./geometry"
import { QuadPaint, usePaintLayers } from "./QuadPaint"
import { paintLayers } from "./paint-layers"

/** One Tab entry, backed by the editor's selection. Paint-only stems have no native semantics. */
export function VelocityLane({
  hostRef,
  roll,
  readNotes,
  selection,
  currentNoteIndex,
  label,
  color,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onVelocityChange,
  onActivateNote,
}: {
  readonly hostRef: Ref<PublicInstance | null>
  readonly roll: RollGeometry
  readonly readNotes: () => readonly MidiNote[]
  readonly selection: readonly number[]
  readonly currentNoteIndex: number | null
  readonly label: string
  readonly color: string
  readonly onMouseDown: (event: EventPayload) => void
  readonly onMouseMove: (event: EventPayload) => void
  readonly onMouseUp: (event: EventPayload) => void
  readonly onVelocityChange: (index: number, delta: number) => void
  readonly onActivateNote: (index: number, preserveSelection: boolean) => void
}) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const notes = readNotes()
  const [focused, setFocused] = useState(false)
  const activeHost = useRef<PublicInstance | null>(null)
  const height = theme.project.midiVelocityHeight
  const handle = theme.project.midiVelocityHandleWidth
  const selected = useMemo(() => new Set(selection), [selection])
  const stems = useMemo(() => {
    const visible = []
    const { sourceOffsetBeats, totalBeats } = roll.window
    for (let index = 0; index < notes.length; index++) {
      const note = notes[index]
      if (
        !note ||
        note.startBeat >= sourceOffsetBeats + totalBeats ||
        note.startBeat + note.lengthBeats <= sourceOffsetBeats
      )
        continue
      const x =
        ((Math.max(note.startBeat, sourceOffsetBeats) - sourceOffsetBeats) / totalBeats) *
          roll.width -
        roll.scrollX
      if (x < -handle || x > roll.viewWidth + handle) continue
      // MIDI velocity is seven-bit protocol data; the scale is independent of editor density.
      visible.push({ index, note, x, stem: (note.velocity / 127) * height })
    }
    return visible
  }, [notes, roll, handle, height])
  const active =
    stems.find(stem => stem.index === currentNoteIndex) ??
    stems.find(stem => selected.has(stem.index)) ??
    stems[0]
  useLayoutEffect(() => {
    if (focused && active && active.index !== currentNoteIndex) onActivateNote(active.index, true)
  }, [focused, active, currentNoteIndex, onActivateNote])
  const layers = useMemo(() => {
    const groups = new Map<string, { color: string; opacity: number; rectangles: number[] }>()
    let previousColor: string | undefined
    let run = 0
    for (const { index, x, stem } of stems) {
      const tint =
        selected.has(index) || (focused && active?.index === index)
          ? theme.colors.foreground
          : color
      if (tint !== previousColor) run++
      previousColor = tint
      const key = `midi-stems-${run}`
      let group = groups.get(key)
      if (!group) {
        group = { color: tint, opacity: 1, rectangles: [] }
        groups.set(key, group)
      }
      group.rectangles.push(
        x,
        height - stem,
        theme.design.editor.velocityLineWidth,
        stem,
        x - handle / 2,
        height - stem - handle / 2,
        handle,
        handle
      )
    }
    return paintLayers(groups)
  }, [
    stems,
    selected,
    focused,
    active?.index,
    color,
    theme.colors.foreground,
    theme.design.editor.velocityLineWidth,
    height,
    handle,
  ])
  const bind = usePaintLayers(layers)
  return (
    <div
      ref={hostRef}
      testId="midi-velocity"
      role="group"
      tabIndex={active ? undefined : 0}
      aria-label={label}
      style={sx({
        position: "relative",
        flexGrow: 1,
        minWidth: 0,
        height,
        overflow: "hidden",
        cursor: theme.design.cursors.verticalResize,
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      })}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {layers.map(layer => (
        <QuadPaint
          key={layer.key}
          id={layer.key}
          color={layer.color}
          opacity={layer.opacity}
          bind={bind}
          width={roll.viewWidth}
          height={height}
        />
      ))}
      {active ? (
        // Audible MIDI note-on velocities span 1–127; zero belongs to the note-off protocol.
        <div
          key="active-stem"
          ref={activeHost}
          testId={`midi-velocity-${active.note.id ?? active.index}`}
          role="slider"
          tabIndex={0}
          aria-label={`${label} ${pitchName(active.note.pitch)} · ${active.note.startBeat}–${active.note.startBeat + active.note.lengthBeats} · ${active.note.velocity}/127`}
          aria-valuemin={1}
          aria-valuemax={127}
          aria-valuenow={active.note.velocity}
          aria-valuetext={String(active.note.velocity)}
          style={sx({
            position: "absolute",
            left: active.x,
            bottom: 0,
            height: active.stem,
            width: theme.design.editor.velocityLineWidth,
            pointerEvents: "none",
            keyboardFocusDim: false,
            focusVisible: {
              outlineWidth: theme.design.shape.focusRingWidth,
              outlineColor: theme.colors.ring,
              outlineOffset: -theme.design.shape.focusRingWidth,
            },
          })}
          onFocus={() => {
            setFocused(true)
            onActivateNote(active.index, true)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={event => {
            if (event.key === "left" || event.key === "right") {
              event.preventDefault()
              event.stopPropagation()
              const position = stems.findIndex(stem => stem.index === active.index)
              const next =
                stems[
                  Math.max(
                    0,
                    Math.min(stems.length - 1, position + (event.key === "right" ? 1 : -1))
                  )
                ]
              if (next) onActivateNote(next.index, false)
              if (activeHost.current) renderer?.focusElement?.(activeHost.current.id)
            } else if (event.key === "up" || event.key === "down") {
              event.preventDefault()
              event.stopPropagation()
              onVelocityChange(active.index, event.key === "up" ? 1 : -1)
            }
          }}
        />
      ) : null}
    </div>
  )
}
