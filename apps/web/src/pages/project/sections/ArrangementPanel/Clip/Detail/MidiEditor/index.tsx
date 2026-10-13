import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { useTranslation } from "@zoeymind/i18n"
import type { MidiClip, MidiNote as Note } from "@/pages/project/model/types"
import { midiInsertionBeat, moveMidiNote } from "@/pages/project/model/midi-notes"
import { effectiveDrawMode } from "@/pages/project/model/interaction-mode"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import { parseNotes, serializeNotes } from "./clipboard"
import {
  drawModeKeyDown,
  markDrawModeGesture,
} from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { MidiNote } from "../MidiNote"

type Gesture = {
  pointerId: number
  target: HTMLElement
  x: number
  y: number
  width: number
  height: number
  notes: Note[]
  selection: number[]
  kind: "move" | "resize" | "draw" | "erase"
  lastCell: number
  pitch: number
  erased: Set<number>
}

function currentNotes(id: string): Note[] {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === id)
  return clip?.kind === "midi" ? clip.notes : []
}

export function MidiEditor({ clip, numerator }: { clip: MidiClip; numerator: number }) {
  const { t } = useTranslation()
  const drawMode = useProjectState(effectiveDrawMode)
  const sourceOffsetBeats = (clip.sourceOffsetBars ?? 0) * numerator
  const totalBeats = clip.lengthBars * numerator
  const [selected, setSelected] = useState<number[]>([])
  const gesture = useRef<Gesture | null>(null)
  const velocityEdit = useRef<number | null>(null)
  const focus = useRef<HTMLDivElement>(null)

  const finish = useCallback((cancel: boolean) => {
    const active = gesture.current
    if (!active) return
    gesture.current = null
    if (cancel) projectActions.cancelEdit()
    else projectActions.endEdit()
    if (active.target.hasPointerCapture(active.pointerId))
      active.target.releasePointerCapture(active.pointerId)
  }, [])
  useEffect(() => {
    const blur = () => {
      finish(true)
      if (velocityEdit.current !== null) {
        velocityEdit.current = null
        projectActions.cancelEdit()
      }
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || (!gesture.current && velocityEdit.current === null)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(true)
      if (velocityEdit.current !== null) {
        velocityEdit.current = null
        projectActions.cancelEdit()
      }
    }
    window.addEventListener("blur", blur)
    window.addEventListener("keydown", escape, true)
    return () => {
      blur()
      window.removeEventListener("blur", blur)
      window.removeEventListener("keydown", escape, true)
    }
  }, [clip.id, finish])

  function insertNote(x: number, y: number, rect: DOMRect) {
    const startBeat = midiInsertionBeat({
      horizontalRatio: (x - rect.left) / rect.width,
      sourceOffsetBeats,
      totalBeats,
    })
    const pitch = Math.max(0, Math.min(127, 84 - Math.floor(((y - rect.top) / rect.height) * 48)))
    const notes = currentNotes(clip.id)
    projectActions.updateClip(clip.id, {
      notes: [
        ...notes,
        { id: crypto.randomUUID(), pitch, startBeat, lengthBeats: 1, velocity: 100 },
      ],
    })
    setSelected([notes.length])
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === "move" || active.kind === "resize") {
      const beatDelta = Math.round(((event.clientX - active.x) / active.width) * totalBeats * 4) / 4
      const pitchDelta = Math.round(((active.y - event.clientY) / active.height) * 48)
      const indices = new Set(active.selection)
      const notes = active.notes.map((note, index) => {
        if (!indices.has(index)) return note
        if (active.kind === "resize")
          return {
            ...note,
            lengthBeats: Math.max(0.25, Math.round((note.lengthBeats + beatDelta) * 4) / 4),
          }
        const moved = moveMidiNote({
          note,
          originalStartBeat: note.startBeat,
          originalPitch: note.pitch,
          beatDelta,
          pitchDelta,
          sourceOffsetBeats,
          totalBeats,
        })
        return { ...moved, pitch: Math.max(37, Math.min(84, moved.pitch)) }
      })
      projectActions.updateClip(clip.id, { notes })
      return
    }
    const rect = active.target.getBoundingClientRect()
    const cell = Math.floor(((event.clientX - rect.left) / rect.width) * totalBeats * 4)
    if (active.kind === "draw") {
      const low = Math.min(active.lastCell, cell)
      const high = Math.max(active.lastCell, cell)
      const notes = currentNotes(clip.id)
      const added: Note[] = []
      for (let i = low; i <= high; i++) {
        const beat = sourceOffsetBeats + i / 4
        if (beat < sourceOffsetBeats || beat >= sourceOffsetBeats + totalBeats) continue
        if (
          notes.some(
            note =>
              note.pitch === active.pitch &&
              note.startBeat <= beat &&
              note.startBeat + note.lengthBeats > beat
          )
        )
          continue
        added.push({
          id: crypto.randomUUID(),
          pitch: active.pitch,
          startBeat: beat,
          lengthBeats: 0.25,
          velocity: 100,
        })
      }
      if (added.length) projectActions.updateClip(clip.id, { notes: [...notes, ...added] })
    } else {
      const low = Math.min(active.lastCell, cell)
      const high = Math.max(active.lastCell, cell)
      for (let index = 0; index < active.notes.length; index++) {
        const note = active.notes[index]
        const startCell = Math.floor((note.startBeat - sourceOffsetBeats) * 4)
        const endCell = Math.ceil((note.startBeat + note.lengthBeats - sourceOffsetBeats) * 4) - 1
        if (note.pitch === active.pitch && startCell <= high && endCell >= low)
          active.erased.add(index)
      }
      projectActions.updateClip(clip.id, {
        notes: active.notes.filter((_, index) => !active.erased.has(index)),
      })
    }
    active.lastCell = cell
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current) return
    if (event.key === "Escape") {
      event.preventDefault()
      if (gesture.current) finish(true)
      else setSelected([])
      return
    }
    if (event.key.toLowerCase() === "b" && drawModeKeyDown(event.nativeEvent)) {
      event.preventDefault()
      return
    }
    const command = event.metaKey || event.ctrlKey
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault()
      if (event.shiftKey) projectActions.redo()
      else projectActions.undo()
      return
    }
    if (command && event.key.toLowerCase() === "a") {
      event.preventDefault()
      setSelected(
        clip.notes.flatMap((note, index) =>
          note.startBeat < sourceOffsetBeats + totalBeats &&
          note.startBeat + note.lengthBeats > sourceOffsetBeats &&
          note.pitch >= 37 &&
          note.pitch <= 84
            ? [index]
            : []
        )
      )
      return
    }
    if (command && ["c", "x", "v"].includes(event.key.toLowerCase())) return
    const indices = selected.filter(index => clip.notes[index])
    if (!indices.length) return
    if (command && event.key.toLowerCase() === "d") {
      event.preventDefault()
      const notes = [
        ...clip.notes,
        ...indices.map(index => ({
          ...clip.notes[index],
          id: crypto.randomUUID(),
          startBeat: clip.notes[index].startBeat + clip.notes[index].lengthBeats,
        })),
      ]
      projectActions.updateClip(clip.id, { notes })
      setSelected(indices.map((_, i) => clip.notes.length + i))
      return
    }
    if (command || event.altKey) return
    if (
      !["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        event.key
      )
    )
      return
    event.preventDefault()
    const chosen = new Set(indices)
    if (event.key === "Delete" || event.key === "Backspace") {
      projectActions.updateClip(clip.id, {
        notes: clip.notes.filter((_, index) => !chosen.has(index)),
      })
      setSelected([])
      return
    }
    const beatDelta = event.key === "ArrowLeft" ? -0.25 : event.key === "ArrowRight" ? 0.25 : 0
    const pitchDelta = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0
    projectActions.updateClip(clip.id, {
      notes: clip.notes.map((note, index) => {
        if (!chosen.has(index)) return note
        const moved = moveMidiNote({
          note,
          originalStartBeat: note.startBeat,
          originalPitch: note.pitch,
          beatDelta,
          pitchDelta,
          sourceOffsetBeats,
          totalBeats,
        })
        return { ...moved, pitch: Math.max(37, Math.min(84, moved.pitch)) }
      }),
    })
  }

  const visibleSelection = selected.filter(index => clip.notes[index])
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
      <div className="mb-1 text-muted-foreground">{t("arrangement.midiEditorHelp")}</div>
      <div
        ref={focus}
        tabIndex={0}
        role="grid"
        aria-label={t("arrangement.midiEditorHelp")}
        className="relative min-h-28 flex-1 cursor-crosshair overflow-hidden rounded border border-border outline-none focus-visible:ring-1 focus-visible:ring-ring touch-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px calc(100% / 16)), repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px calc(100% / 48))",
        }}
        onKeyDown={handleKey}
        onCopy={event => {
          if (event.target !== focus.current) return
          const indices = selected.filter(index => clip.notes[index])
          if (!indices.length) return
          const text = serializeNotes(indices.map(index => clip.notes[index]))
          event.clipboardData.setData("text/plain", text)
          clipboardMemory.write(text)
          event.preventDefault()
        }}
        onCut={event => {
          if (event.target !== focus.current) return
          const indices = selected.filter(index => clip.notes[index])
          if (!indices.length) return
          const text = serializeNotes(indices.map(index => clip.notes[index]))
          event.clipboardData.setData("text/plain", text)
          clipboardMemory.write(text)
          event.preventDefault()
          projectActions.updateClip(clip.id, {
            notes: clip.notes.filter((_, index) => !indices.includes(index)),
          })
          setSelected([])
        }}
        onPaste={event => {
          if (event.target !== focus.current) return
          const text = event.clipboardData.getData("text/plain")
          clipboardMemory.write(text)
          const copied = parseNotes(text)
          if (!copied) return
          event.preventDefault()
          const notes = [
            ...clip.notes,
            ...copied.map(note => ({
              ...note,
              id: crypto.randomUUID(),
              startBeat: note.startBeat + 0.25,
            })),
          ]
          projectActions.updateClip(clip.id, { notes })
          setSelected(copied.map((_, index) => clip.notes.length + index))
        }}
        onPointerDown={event => {
          if (event.button !== 0 || gesture.current) return
          markDrawModeGesture()
          event.stopPropagation()
          event.currentTarget.focus()
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-note-index]")
              : null
          const index = target ? Number(target.dataset.noteIndex) : -1
          const hit = Number.isInteger(index) && clip.notes[index]
          const rect = event.currentTarget.getBoundingClientRect()
          const notes = currentNotes(clip.id)
          const previous = selected
          if (drawMode) {
            projectActions.beginEdit()
            if (hit) {
              gesture.current = {
                pointerId: event.pointerId,
                target: event.currentTarget,
                x: event.clientX,
                y: event.clientY,
                width: rect.width,
                height: rect.height,
                notes,
                selection: [],
                kind: "erase",
                lastCell: Math.floor(((event.clientX - rect.left) / rect.width) * totalBeats * 4),
                pitch: clip.notes[index].pitch,
                erased: new Set([index]),
              }
              projectActions.updateClip(clip.id, { notes: notes.filter((_, i) => i !== index) })
              setSelected([])
            } else {
              const pitch = Math.max(
                0,
                Math.min(127, 84 - Math.floor(((event.clientY - rect.top) / rect.height) * 48))
              )
              gesture.current = {
                pointerId: event.pointerId,
                target: event.currentTarget,
                x: event.clientX,
                y: event.clientY,
                width: rect.width,
                height: rect.height,
                notes,
                selection: [],
                kind: "draw",
                lastCell: Math.floor(((event.clientX - rect.left) / rect.width) * totalBeats * 4),
                pitch,
                erased: new Set(),
              }
              handleMove(event)
            }
          } else if (hit) {
            const selection =
              event.shiftKey || event.metaKey || event.ctrlKey
                ? previous.includes(index)
                  ? previous.filter(item => item !== index)
                  : [...previous, index]
                : previous.includes(index)
                  ? previous
                  : [index]
            setSelected(selection)
            if (selection.includes(index) && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
              projectActions.beginEdit()
              gesture.current = {
                pointerId: event.pointerId,
                target: event.currentTarget,
                x: event.clientX,
                y: event.clientY,
                width: rect.width,
                height: rect.height,
                notes,
                selection,
                kind:
                  event.target instanceof Element && event.target.closest("[data-note-edge]")
                    ? "resize"
                    : "move",
                lastCell: -1,
                pitch: 0,
                erased: new Set(),
              }
            }
          } else setSelected([])
          if (gesture.current) event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={handleMove}
        onPointerUp={event => {
          if (event.pointerId === gesture.current?.pointerId) finish(false)
        }}
        onPointerCancel={event => {
          if (event.pointerId === gesture.current?.pointerId) finish(true)
        }}
        onLostPointerCapture={event => {
          if (event.pointerId === gesture.current?.pointerId) finish(true)
        }}
        onDoubleClick={event => {
          if (
            drawMode ||
            (event.target instanceof Element && event.target.closest("[data-note-index]"))
          )
            return
          insertNote(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
        }}
      >
        {clip.notes.map((note, index) => (
          <MidiNote
            key={note.id ?? index}
            note={note}
            index={index}
            selected={visibleSelection.includes(index)}
            sourceOffsetBeats={sourceOffsetBeats}
            totalBeats={totalBeats}
          />
        ))}
      </div>
      {visibleSelection.length > 0 && (
        <label className="mt-1 flex items-center gap-2 text-muted-foreground">
          {t("arrangement.velocity")}
          <input
            type="range"
            min={1}
            max={127}
            value={clip.notes[visibleSelection[0]].velocity}
            aria-label={t("arrangement.velocity")}
            onPointerDown={event => {
              if (velocityEdit.current === null) {
                velocityEdit.current = event.pointerId
                projectActions.beginEdit()
                event.currentTarget.setPointerCapture(event.pointerId)
              }
            }}
            onPointerUp={event => {
              if (velocityEdit.current === event.pointerId) {
                velocityEdit.current = null
                projectActions.endEdit()
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onPointerCancel={event => {
              if (velocityEdit.current === event.pointerId) {
                velocityEdit.current = null
                projectActions.cancelEdit()
              }
            }}
            onLostPointerCapture={event => {
              if (velocityEdit.current === event.pointerId) {
                velocityEdit.current = null
                projectActions.cancelEdit()
              }
            }}
            onBlur={() => {
              if (velocityEdit.current !== null) {
                velocityEdit.current = null
                projectActions.endEdit()
              }
            }}
            onChange={event => {
              const velocity = Number(event.target.value)
              const indices = new Set(visibleSelection)
              projectActions.updateClip(clip.id, {
                notes: currentNotes(clip.id).map((note, index) =>
                  indices.has(index) ? { ...note, velocity } : note
                ),
              })
            }}
          />
          {clip.notes[visibleSelection[0]].velocity}
        </label>
      )}
    </div>
  )
}
