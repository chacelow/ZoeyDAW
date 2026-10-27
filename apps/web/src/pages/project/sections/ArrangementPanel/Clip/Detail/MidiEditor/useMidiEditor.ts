import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
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
} from "@zoeydaw/project-core/midi-editing"
import { projectActions, useProjectEditGesture, useProjectState } from "@/pages/project/adapters"
import { clipboardMemory } from "@/pages/project/adapters/clipboard-memory"
import { effectiveDrawMode } from "@zoeydaw/project-core/interaction-mode"
import { resolveMidiClip } from "@zoeydaw/project-core/patterns"
import {
  cancelDrawModeKey,
  drawModeKeyDown,
  markDrawModeGesture,
  setDrawModeLatched,
  useDrawModeKeyRelease,
} from "@/pages/project/sections/ArrangementPanel/Timeline/drawModeKey"
import { parseNotes, serializeNotes } from "./clipboard"
import { pitchAt } from "./geometry"
import type { ClipboardEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react"
import type { MidiClipContent, MidiNote } from "@zoeydaw/project-core/types"
import { locateClip } from "@zoeydaw/project-core/clip-content"

interface Gesture {
  clipId: string
  pointerId: number
  target: HTMLElement
  x: number
  y: number
  originX: number
  originY: number
  width: number
  height: number
  notes: MidiNote[]
  pitches: readonly number[]
  selection: number[]
  kind: "move" | "resize" | "draw" | "erase" | "marquee" | "velocity"
  lastCell: number
  pitch: number
  erased: Set<number>
}

function currentNotes(id: string): MidiNote[] {
  const document = useProjectState.getState().document
  const clip = locateClip(document.tracks, id)?.clip
  return clip && clip.kind !== "audio" ? resolveMidiClip(clip, document.patterns).notes : []
}

export function useMidiEditor(
  clip: MidiClipContent,
  numerator: number,
  pitches: readonly number[]
) {
  const liveId = useRef(clip.id)
  const owner = useRef(clip.id)
  const transaction = useProjectEditGesture((notes: MidiNote[]) => {
    if (owner.current === liveId.current) projectActions.updateClip(owner.current, { notes })
  })
  const drawMode = useProjectState(effectiveDrawMode)
  useDrawModeKeyRelease()
  const [selected, setSelected] = useState<number[]>([])
  const [marquee, setMarquee] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const focus = useRef<HTMLDivElement>(null)
  const sourceWindow = {
    sourceOffsetBeats: (clip.sourceOffsetBars ?? 0) * numerator,
    totalBeats: clip.lengthBars * numerator,
  }
  const visibleSelection = validSelection(clip.notes, selected)
  const finish = useCallback(
    (cancel: boolean) => {
      const active = gesture.current
      if (!active) return
      gesture.current = null
      setMarquee(null)
      if (active.kind === "marquee") {
        if (cancel) setSelected(active.selection)
      } else if (cancel) transaction.onGestureCancel()
      else transaction.onGestureEnd()
      if (active.target.hasPointerCapture(active.pointerId)) {
        active.target.releasePointerCapture(active.pointerId)
      }
    },
    [transaction]
  )

  useLayoutEffect(() => {
    finish(true)
    liveId.current = clip.id
    owner.current = clip.id
    setSelected([])
    return () => {
      finish(true)
      liveId.current = ""
    }
  }, [clip.id, finish])

  useEffect(() => {
    const blur = () => finish(true)
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !gesture.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      finish(true)
    }
    window.addEventListener("blur", blur)
    window.addEventListener("keydown", cancelOnEscape, true)
    return () => {
      finish(true)
      window.removeEventListener("blur", blur)
      window.removeEventListener("keydown", cancelOnEscape, true)
    }
  }, [finish])

  function handleMove(event: PointerEvent<HTMLElement>) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId || active.clipId !== liveId.current) return
    if (active.kind === "velocity") {
      const rect = active.target.getBoundingClientRect()
      transaction.onChange(
        setNoteVelocity(
          active.notes,
          active.selection,
          127 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 127
        ).notes
      )
      return
    }
    if (active.kind === "move" || active.kind === "resize") {
      const beatDelta =
        Math.round(((event.clientX - active.x) / active.width) * sourceWindow.totalBeats * 4) / 4
      const rect = active.target.getBoundingClientRect()
      const pitchDelta =
        pitchAt(event.clientY - rect.top, active.height, active.pitches) - active.pitch
      transaction.onChange(
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
    const x = Math.max(0, Math.min(active.width, event.clientX - rect.left))
    const y = Math.max(0, Math.min(active.height, event.clientY - rect.top))
    if (active.kind === "marquee") {
      const left = Math.min(active.originX, x)
      const right = Math.max(active.originX, x)
      const top = Math.min(active.originY, y)
      const bottom = Math.max(active.originY, y)
      const hits = selectVisibleNotes(active.notes, sourceWindow).filter(index => {
        const note = active.notes[index]
        const row = active.pitches.indexOf(note.pitch)
        const noteLeft =
          ((note.startBeat - sourceWindow.sourceOffsetBeats) / sourceWindow.totalBeats) *
          active.width
        const noteRight = noteLeft + (note.lengthBeats / sourceWindow.totalBeats) * active.width
        const noteTop = (row / active.pitches.length) * active.height
        return (
          row !== -1 &&
          noteLeft < right &&
          noteRight > left &&
          noteTop < bottom &&
          noteTop + active.height / active.pitches.length > top
        )
      })
      setSelected([...new Set([...active.selection, ...hits])])
      setMarquee({ x: left, y: top, width: right - left, height: bottom - top })
      return
    }
    const cell = Math.floor((x / active.width) * sourceWindow.totalBeats * 4)
    const pitch = pitchAt(y, active.height, active.pitches)
    const firstCell = pitch === active.pitch ? active.lastCell : cell
    if (active.kind === "draw") {
      const notes = currentNotes(active.clipId)
      const edit = drawCells({
        notes,
        selection: [],
        firstCell,
        lastCell: cell,
        pitch,
        window: sourceWindow,
        createId: () => crypto.randomUUID(),
      })
      if (edit.notes.length !== notes.length) transaction.onChange(edit.notes)
    } else {
      const result = eraseCells({
        notes: active.notes,
        selection: [],
        firstCell,
        lastCell: cell,
        pitch,
        window: sourceWindow,
        erased: active.erased,
      })
      active.erased = result.erased
      transaction.onChange(result.edit.notes)
    }
    active.pitch = pitch
    active.lastCell = cell
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== focus.current || clip.id !== liveId.current) return
    const command = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (key === "escape") {
      event.preventDefault()
      if (gesture.current) finish(true)
      else setSelected([])
    } else if (key === "b" && drawModeKeyDown(event.nativeEvent)) {
      event.preventDefault()
    } else if (command && key === "z") {
      event.preventDefault()
      if (gesture.current) finish(true)
      else if (event.shiftKey) projectActions.redo()
      else projectActions.undo()
    } else if (command && key === "a") {
      event.preventDefault()
      setSelected(selectVisibleNotes(clip.notes, sourceWindow))
    } else if (command && key === "d" && visibleSelection.length) {
      event.preventDefault()
      const edit = duplicateNotes(clip.notes, visibleSelection, () => crypto.randomUUID())
      projectActions.updateClip(clip.id, { notes: edit.notes })
      setSelected(edit.selection)
    } else if (
      !command &&
      !event.altKey &&
      visibleSelection.length &&
      ["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault()
      if (event.key === "Delete" || event.key === "Backspace") {
        const edit = deleteNotes(clip.notes, visibleSelection)
        projectActions.updateClip(clip.id, { notes: edit.notes })
        setSelected(edit.selection)
      } else {
        const beatDelta = event.key === "ArrowLeft" ? -0.25 : event.key === "ArrowRight" ? 0.25 : 0
        const step = event.shiftKey ? 12 : 1
        const pitchDelta = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0
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
    }
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    event.stopPropagation()
    if (event.target !== focus.current || !visibleSelection.length || liveId.current !== clip.id)
      return
    const text = serializeNotes(visibleSelection.map(index => clip.notes[index]))
    event.clipboardData.setData("text/plain", text)
    clipboardMemory.write(text)
    event.preventDefault()
  }
  function handleCut(event: ClipboardEvent<HTMLDivElement>) {
    handleCopy(event)
    if (!event.defaultPrevented) return
    const edit = deleteNotes(clip.notes, visibleSelection)
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.stopPropagation()
    if (event.target !== focus.current || liveId.current !== clip.id) return
    const text = event.clipboardData.getData("text/plain")
    clipboardMemory.write(text)
    const copied = parseNotes(text)
    if (!copied) return
    event.preventDefault()
    const edit = pasteNotes(clip.notes, copied, () => crypto.randomUUID())
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || gesture.current || liveId.current !== clip.id) return
    event.preventDefault()
    event.stopPropagation()
    markDrawModeGesture()
    event.currentTarget.focus({ preventScroll: true })
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-note-index]")
        : null
    const index = target ? Number(target.dataset.noteIndex) : -1
    const hit = Number.isInteger(index) ? clip.notes[index] : undefined
    const rect = event.currentTarget.getBoundingClientRect()
    const notes = currentNotes(clip.id)
    const extend = event.shiftKey || event.metaKey || event.ctrlKey
    const base = {
      clipId: clip.id,
      pointerId: event.pointerId,
      target: event.currentTarget,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX - rect.left,
      originY: event.clientY - rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      notes,
      pitches,
      selection: [],
      lastCell: Math.floor(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * sourceWindow.totalBeats * 4
      ),
      pitch: pitchAt(event.clientY - rect.top, Math.max(1, rect.height), pitches),
      erased: new Set<number>(),
    }
    owner.current = clip.id
    if (drawMode) {
      transaction.onGestureStart()
      setSelected([])
      gesture.current = {
        ...base,
        kind: hit ? "erase" : "draw",
        erased: new Set(hit ? [index] : []),
      }
      if (hit) transaction.onChange(deleteNotes(notes, [index]).notes)
      else handleMove(event)
    } else if (hit) {
      const selection = selectHit(selected, index, extend)
      setSelected(selection)
      if (selection.includes(index) && !extend) {
        transaction.onGestureStart()
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
      const selection = extend ? selected : []
      setSelected(selection)
      gesture.current = { ...base, kind: "marquee", selection }
    }
    if (gesture.current) event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if (drawMode || liveId.current !== clip.id) return
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-note-index]")
        : null
    if (target) {
      projectActions.updateClip(clip.id, {
        notes: deleteNotes(clip.notes, [Number(target.dataset.noteIndex)]).notes,
      })
      setSelected([])
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const pitch = pitchAt(event.clientY - rect.top, Math.max(1, rect.height), pitches)
    const edit = insertNote({
      notes: currentNotes(clip.id),
      horizontalRatio: (event.clientX - rect.left) / Math.max(1, rect.width),
      verticalRatio: (127 - pitch + 0.5) / 128,
      window: sourceWindow,
      id: crypto.randomUUID(),
    })
    projectActions.updateClip(clip.id, { notes: edit.notes })
    setSelected(edit.selection)
  }

  function startVelocity(event: PointerEvent<HTMLElement>, index?: number) {
    if (gesture.current || liveId.current !== clip.id || event.button !== 0) return
    event.stopPropagation()
    const selection =
      index === undefined ? visibleSelection : selected.includes(index) ? visibleSelection : [index]
    if (!selection.length) return
    setSelected(selection)
    const rect = event.currentTarget.getBoundingClientRect()
    owner.current = clip.id
    transaction.onGestureStart()
    gesture.current = {
      clipId: clip.id,
      pointerId: event.pointerId,
      target: event.currentTarget,
      kind: "velocity",
      notes: currentNotes(clip.id),
      pitches,
      selection,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX - rect.left,
      originY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      pitch: 0,
      lastCell: 0,
      erased: new Set(),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (index !== undefined) handleMove(event)
  }
  function changeVelocity(value: number, index?: number) {
    const selection =
      index === undefined ? visibleSelection : selected.includes(index) ? visibleSelection : [index]
    if (liveId.current !== clip.id || !selection.length || !Number.isFinite(value)) return
    if (index !== undefined) setSelected(selection)
    if (gesture.current?.kind === "velocity") {
      transaction.onChange(setNoteVelocity(currentNotes(clip.id), selection, value).notes)
    } else
      projectActions.updateClip(clip.id, {
        notes: setNoteVelocity(currentNotes(clip.id), selection, value).notes,
      })
  }
  const pointerEnd = {
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId === gesture.current?.pointerId) finish(false)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId === gesture.current?.pointerId) finish(true)
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerId === gesture.current?.pointerId) finish(true)
    },
  }
  return {
    focus,
    visibleSelection,
    window: sourceWindow,
    drawMode,
    setDrawMode: setDrawModeLatched,
    marquee,
    finish,
    blur: () => {
      finish(true)
      cancelDrawModeKey()
    },
    changeLoopBars: (value: number) => {
      if (liveId.current !== clip.id || !Number.isFinite(value) || value < 0.0625) return
      finish(true)
      projectActions.updateClip(clip.id, { loopBars: value })
    },
    selectPitch: (pitch: number, extend: boolean) => {
      if (liveId.current !== clip.id) return
      const indices = selectVisibleNotes(clip.notes, sourceWindow).filter(
        index => clip.notes[index].pitch === pitch
      )
      setSelected(extend ? [...new Set([...selected, ...indices])] : indices)
    },
    grid: {
      onKeyDown: handleKey,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onPointerDown: handlePointerDown,
      onPointerMove: handleMove,
      onDoubleClick: handleDoubleClick,
      ...pointerEnd,
    },
    velocity: {
      start: startVelocity,
      change: changeVelocity,
      onPointerMove: handleMove,
      ...pointerEnd,
    },
  }
}
