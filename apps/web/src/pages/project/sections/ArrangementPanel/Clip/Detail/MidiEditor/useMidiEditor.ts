import { useCallback, useEffect, useRef, useState } from "react"
import {
  deleteNotes,
  drawCells,
  duplicateNotes,
  eraseCells,
  insertNote,
  pasteNotes,
  selectHit,
  selectVisibleNotes,
  setNoteVelocity,
  transformNotes,
  validSelection,
} from "@/pages/project/model/midi-editing"
import { effectiveDrawMode } from "@/pages/project/model/interaction-mode"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import {
  drawModeKeyDown,
  markDrawModeGesture,
} from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { parseNotes, serializeNotes } from "./clipboard"
import type { ChangeEvent, ClipboardEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react"
import type { MidiClip, MidiNote } from "@/pages/project/model/types"

const createNoteId = () => crypto.randomUUID()

interface Gesture {
  pointerId: number
  target: HTMLElement
  x: number
  y: number
  width: number
  height: number
  notes: MidiNote[]
  selection: number[]
  kind: "move" | "resize" | "draw" | "erase"
  lastCell: number
  pitch: number
  erased: Set<number>
}

function currentNotes(id: string): MidiNote[] {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(item => item.id === id)
  return clip?.kind === "midi" ? clip.notes : []
}

export function useMidiEditor(clip: MidiClip, numerator: number) {
  const noteGesture = useProjectEditGesture((notes: MidiNote[]) =>
    projectActions.updateClip(clip.id, { notes })
  )
  const velocityGesture = useProjectEditGesture((notes: MidiNote[]) =>
    projectActions.updateClip(clip.id, { notes })
  )
  const drawMode = useProjectState(effectiveDrawMode)
  const sourceWindow = {
    sourceOffsetBeats: (clip.sourceOffsetBars ?? 0) * numerator,
    totalBeats: clip.lengthBars * numerator,
  }
  const [selected, setSelected] = useState<number[]>([])
  const gesture = useRef<Gesture | null>(null)
  const velocityEdit = useRef<number | null>(null)
  const focus = useRef<HTMLDivElement>(null)
  const visibleSelection = validSelection(clip.notes, selected)

  const finish = useCallback(
    (cancel: boolean) => {
      const active = gesture.current
      if (!active) {
        return
      }
      gesture.current = null
      if (cancel) {
        noteGesture.onGestureCancel()
      } else {
        noteGesture.onGestureEnd()
      }
      if (active.target.hasPointerCapture(active.pointerId)) {
        active.target.releasePointerCapture(active.pointerId)
      }
    },
    [noteGesture]
  )

  useEffect(() => {
    const blur = () => {
      finish(true)
      if (velocityEdit.current === null) {
        return
      }

      velocityEdit.current = null
      velocityGesture.onGestureCancel()
    }
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || (!gesture.current && velocityEdit.current === null)) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      blur()
    }
    window.addEventListener("blur", blur)
    window.addEventListener("keydown", onEscape, { capture: true })
    return () => {
      blur()
      window.removeEventListener("blur", blur)
      window.removeEventListener("keydown", onEscape, true)
    }
  }, [clip.id, finish, velocityGesture])

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) {
      return
    }
    if (active.kind === "move" || active.kind === "resize") {
      const beatDelta =
        Math.round(((event.clientX - active.x) / active.width) * sourceWindow.totalBeats * 4) / 4
      const pitchDelta = Math.round(((active.y - event.clientY) / active.height) * 48)
      noteGesture.onChange(
        transformNotes({
          notes: active.notes,
          selection: active.selection,
          kind: active.kind,
          beatDelta,
          pitchDelta,
          window: sourceWindow,
        }).notes
      )
      return
    }
    const rect = active.target.getBoundingClientRect()
    const cell = Math.floor(
      ((event.clientX - rect.left) / rect.width) * sourceWindow.totalBeats * 4
    )
    if (active.kind === "draw") {
      const notes = currentNotes(clip.id)
      const edit = drawCells({
        notes,
        selection: active.selection,
        firstCell: active.lastCell,
        lastCell: cell,
        pitch: active.pitch,
        window: sourceWindow,
        createId: createNoteId,
      })
      if (edit.notes.length !== notes.length) {
        noteGesture.onChange(edit.notes)
      }
    } else {
      const result = eraseCells({
        notes: active.notes,
        selection: active.selection,
        firstCell: active.lastCell,
        lastCell: cell,
        pitch: active.pitch,
        window: sourceWindow,
        erased: active.erased,
      })
      active.erased = result.erased
      noteGesture.onChange(result.edit.notes)
    }
    active.lastCell = cell
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current) {
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      if (gesture.current) {
        finish(true)
      } else {
        setSelected([])
      }
      return
    }
    if (event.key.toLowerCase() === "b" && drawModeKeyDown(event.nativeEvent)) {
      event.preventDefault()
      return
    }
    const command = event.metaKey || event.ctrlKey
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault()
      if (event.shiftKey) {
        projectActions.redo()
      } else {
        projectActions.undo()
      }
      return
    }
    if (command && event.key.toLowerCase() === "a") {
      event.preventDefault()
      setSelected(selectVisibleNotes(clip.notes, sourceWindow))
      return
    }
    if (command && ["c", "x", "v"].includes(event.key.toLowerCase())) {
      return
    }
    if (!visibleSelection.length) {
      return
    }
    if (command && event.key.toLowerCase() === "d") {
      event.preventDefault()
      const edit = duplicateNotes(clip.notes, visibleSelection, createNoteId)
      projectActions.updateClip(clip.id, { notes: edit.notes })
      setSelected(edit.selection)
      return
    }
    if (
      command ||
      event.altKey ||
      !["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        event.key
      )
    ) {
      return
    }
    event.preventDefault()
    if (event.key === "Delete" || event.key === "Backspace") {
      const edit = deleteNotes(clip.notes, visibleSelection)
      projectActions.updateClip(clip.id, { notes: edit.notes })
      setSelected(edit.selection)
      return
    }
    const beatDelta = event.key === "ArrowLeft" ? -0.25 : event.key === "ArrowRight" ? 0.25 : 0
    const pitchDelta = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0
    projectActions.updateClip(clip.id, {
      notes: transformNotes({
        notes: clip.notes,
        selection: visibleSelection,
        kind: "move",
        beatDelta,
        pitchDelta,
        window: sourceWindow,
      }).notes,
    })
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current || !visibleSelection.length) {
      return
    }
    const text = serializeNotes(visibleSelection.map(index => clip.notes[index]))
    event.clipboardData.setData("text/plain", text)
    clipboardMemory.write(text)
    event.preventDefault()
  }

  function handleCut(event: ClipboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current || !visibleSelection.length) {
      return
    }
    handleCopy(event)
    const edit = deleteNotes(clip.notes, visibleSelection)
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current) {
      return
    }
    const text = event.clipboardData.getData("text/plain")
    clipboardMemory.write(text)
    const copied = parseNotes(text)
    if (!copied) {
      return
    }
    event.preventDefault()
    const edit = pasteNotes(clip.notes, copied, createNoteId)
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current) {
      return
    }
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
    const base = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      notes,
      selection: [],
      lastCell: Math.floor(
        ((event.clientX - rect.left) / rect.width) * sourceWindow.totalBeats * 4
      ),
      pitch: 0,
      erased: new Set<number>(),
    }
    if (drawMode) {
      noteGesture.onGestureStart()
      if (hit) {
        gesture.current = {
          ...base,
          kind: "erase",
          pitch: clip.notes[index].pitch,
          erased: new Set([index]),
        }
        noteGesture.onChange(deleteNotes(notes, [index]).notes)
        setSelected([])
      } else {
        const pitch = Math.max(
          0,
          Math.min(127, 84 - Math.floor(((event.clientY - rect.top) / rect.height) * 48))
        )
        gesture.current = { ...base, kind: "draw", pitch }
        handleMove(event)
      }
    } else if (hit) {
      const extend = event.shiftKey || event.metaKey || event.ctrlKey
      const selection = selectHit(selected, index, extend)
      setSelected(selection)
      if (selection.includes(index) && !extend) {
        noteGesture.onGestureStart()
        gesture.current = {
          ...base,
          selection,
          kind:
            event.target instanceof Element && event.target.closest("[data-note-edge]")
              ? "resize"
              : "move",
        }
      }
    } else {
      setSelected([])
    }
    if (gesture.current) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      drawMode ||
      (event.target instanceof Element && event.target.closest("[data-note-index]"))
    ) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const edit = insertNote({
      notes: currentNotes(clip.id),
      horizontalRatio: (event.clientX - rect.left) / rect.width,
      verticalRatio: (event.clientY - rect.top) / rect.height,
      window: sourceWindow,
      id: createNoteId(),
    })
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }

  function handleVelocityDown(event: PointerEvent<HTMLInputElement>) {
    if (velocityEdit.current !== null) {
      return
    }
    velocityEdit.current = event.pointerId
    velocityGesture.onGestureStart()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleVelocityUp(event: PointerEvent<HTMLInputElement>) {
    if (velocityEdit.current !== event.pointerId) {
      return
    }
    velocityEdit.current = null
    velocityGesture.onGestureEnd()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleVelocityCancel(event: PointerEvent<HTMLInputElement>) {
    if (velocityEdit.current !== event.pointerId) {
      return
    }
    velocityEdit.current = null
    velocityGesture.onGestureCancel()
  }

  function handleVelocityBlur() {
    if (velocityEdit.current === null) {
      return
    }
    velocityEdit.current = null
    velocityGesture.onGestureEnd()
  }

  function handleVelocityChange(event: ChangeEvent<HTMLInputElement>) {
    const isKeyboard = velocityEdit.current === null
    if (isKeyboard) {
      velocityGesture.onGestureStart()
    }
    velocityGesture.onChange(
      setNoteVelocity(currentNotes(clip.id), visibleSelection, Number(event.target.value)).notes
    )
    if (isKeyboard) {
      velocityGesture.onGestureEnd()
    }
  }

  return {
    focus,
    visibleSelection,
    window: sourceWindow,
    grid: {
      onKeyDown: handleKey,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onPointerDown: handlePointerDown,
      onPointerMove: handleMove,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerId === gesture.current?.pointerId) {
          finish(false)
        }
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerId === gesture.current?.pointerId) {
          finish(true)
        }
      },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerId === gesture.current?.pointerId) {
          finish(true)
        }
      },
      onDoubleClick: handleDoubleClick,
    },
    velocity: {
      onPointerDown: handleVelocityDown,
      onPointerUp: handleVelocityUp,
      onPointerCancel: handleVelocityCancel,
      onLostPointerCapture: handleVelocityCancel,
      onBlur: handleVelocityBlur,
      onChange: handleVelocityChange,
    },
  }
}
