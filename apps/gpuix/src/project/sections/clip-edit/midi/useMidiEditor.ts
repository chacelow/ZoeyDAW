import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePreference } from "@/platform/settings"
import { useGpuix } from "@gpuix/react"
import type { EventPayload, KeyEvent, PublicInstance } from "@gpuix/react"
import { projectActions, useProjectEditGesture, useProjectState } from "@/project/adapters"
import { clipboardMemory } from "@/project/adapters/clipboard-memory"
import { effectiveDrawMode } from "@/project/model/interaction-mode"
import {
  deleteNotes,
  drawCells,
  duplicateNotes,
  eraseCells,
  insertNote,
  pasteNotes,
  quantizeNotes,
  selectHit,
  selectVisibleNotes,
  setNoteVelocity,
  transformNotes,
} from "@/project/model/midi-editing"
import { uniqueId } from "@/project/model/reducers"
import { useClipEditorEnvironment } from "../environment"
import { parseNotes, serializeNotes } from "./clipboard"
import { cellAt, hitNote, marqueeHits, pitchAt } from "./layout"
import type { MidiClip, MidiNote } from "@/project/model/types"
import type { RollGeometry } from "./layout"

type GestureKind = "move" | "resize" | "draw" | "erase" | "marquee" | "velocity"

interface Gesture {
  readonly kind: GestureKind
  /** Window position of the host's top-left at press time; content = window − origin + scroll. */
  readonly origin: { x: number; y: number }
  /** Content position of the press, fixed while the roll scrolls. */
  readonly start: { x: number; y: number }
  readonly notes: MidiNote[]
  readonly selection: number[]
  readonly currentNoteIndex: number | null
  readonly pitch: number
  lastCell: number
  lastPitch: number
  erased: Set<number>
}

interface NoteSelection {
  readonly ids: string[]
  readonly current: string | null
}

export interface Marquee {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const MOVE_KEYS: Readonly<Record<string, readonly [beats: number, pitches: number]>> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
}
const DRAG_BLOCKED_COMMANDS: Readonly<Record<string, true>> = { d: true, u: true, x: true, v: true }

function storedNotes(id: string): MidiNote[] {
  for (const track of useProjectState.getState().document.tracks)
    for (const clip of track.clips) if (clip.id === id && clip.kind === "midi") return clip.notes
  return []
}

/**
One piano roll's editing state. Selection is local; every note change goes through a single project
edit transaction (one undo entry, cancel restores). The editor is keyed by clip, so a clip switch
unmounts it and the transaction hook cancels whatever gesture was active.
*/
export function useMidiEditor(clip: MidiClip, roll: RollGeometry, velocityHeight: number) {
  const { renderer } = useGpuix()
  const environment = useClipEditorEnvironment()
  const midi = usePreference("midi")
  const drawMode = useProjectState(effectiveDrawMode)
  const transaction = useProjectEditGesture((notes: MidiNote[]) =>
    projectActions.updateClip(clip.id, { notes })
  )
  const [selection, setSelection] = useState<NoteSelection>({ ids: [], current: null })
  const setSelected = useCallback(
    (indices: number[], preferred: number | null) => {
      const notes = storedNotes(clip.id)
      const ids = indices.flatMap(index => {
        const id = notes[index]?.id
        return id === undefined ? [] : [id]
      })
      const current = preferred === null ? undefined : notes[preferred]?.id
      setSelection({
        ids,
        current: current !== undefined && ids.includes(current) ? current : (ids[0] ?? null),
      })
    },
    [clip.id]
  )
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const host = useRef<PublicInstance | null>(null)
  const velocityHost = useRef<PublicInstance | null>(null)
  const latest = useRef(roll)
  latest.current = roll
  const visibleSelection = useMemo(() => {
    const ids = new Set(selection.ids)
    return clip.notes.flatMap((note, index) =>
      note.id !== undefined && ids.has(note.id) ? [index] : []
    )
  }, [clip.notes, selection.ids])
  const currentNoteIndex =
    visibleSelection.find(index => clip.notes[index]?.id === selection.current) ??
    visibleSelection[0] ??
    null

  const finish = useCallback(
    (cancel: boolean) => {
      const active = gesture.current
      if (!active) return
      gesture.current = null
      setMarquee(null)
      if (active.kind === "marquee") {
        if (cancel) setSelected(active.selection, active.currentNoteIndex)
      } else if (cancel) transaction.onGestureCancel()
      else transaction.onGestureEnd()
    },
    [transaction, setSelected]
  )
  useEffect(
    () =>
      environment.subscribeWindowActive(active => {
        if (!active) finish(true)
      }),
    [environment, finish]
  )
  useEffect(() => {
    finish(true)
  }, [roll.width, roll.rowHeight, roll.window.totalBeats, roll.window.sourceOffsetBeats, finish])

  function content(event: EventPayload, active: Pick<Gesture, "origin">) {
    const view = latest.current
    return {
      x: (event.x ?? active.origin.x) - active.origin.x + view.scrollX,
      y: (event.y ?? active.origin.y) - active.origin.y + view.scrollY,
    }
  }

  function move(event: EventPayload) {
    const active = gesture.current
    if (!active) return
    const view = latest.current
    if (active.kind === "velocity") {
      const y = (event.y ?? active.origin.y) - active.origin.y
      transaction.onChange(
        setNoteVelocity(
          active.notes,
          active.selection,
          127 - (y / Math.max(1, velocityHeight)) * 127
        ).notes
      )
      return
    }
    const point = content(event, active)
    if (active.kind === "move" || active.kind === "resize") {
      const beatDelta =
        Math.round(
          ((point.x - active.start.x) / Math.max(1, view.width)) *
            (view.window.totalBeats / midi.noteGridBeats)
        ) * midi.noteGridBeats
      transaction.onChange(
        transformNotes({
          notes: active.notes,
          selection: active.selection,
          kind: active.kind,
          beatDelta,
          pitchDelta: pitchAt(point.y, view) - active.pitch,
          window: view.window,
          policy: midi,
        }).notes
      )
      return
    }
    const x = Math.max(0, Math.min(view.width, point.x))
    const y = Math.max(0, Math.min(view.pitches.length * view.rowHeight, point.y))
    if (active.kind === "marquee") {
      const box = {
        left: Math.min(active.start.x, x),
        right: Math.max(active.start.x, x),
        top: Math.min(active.start.y, y),
        bottom: Math.max(active.start.y, y),
      }
      setSelected(
        [...new Set([...active.selection, ...marqueeHits(active.notes, view, box)])],
        currentNoteIndex
      )
      setMarquee(box)
      return
    }
    const cell = cellAt(x, view, midi.noteGridBeats)
    const pitch = pitchAt(y, view)
    const firstCell = pitch === active.lastPitch ? active.lastCell : cell
    if (active.kind === "draw") {
      const notes = storedNotes(clip.id)
      const edit = drawCells({
        notes,
        selection: [],
        firstCell,
        lastCell: cell,
        pitch,
        window: view.window,
        createId: () => uniqueId("note"),
        policy: midi,
      })
      if (edit.notes.length !== notes.length) transaction.onChange(edit.notes)
    } else {
      const result = eraseCells({
        notes: active.notes,
        selection: [],
        firstCell,
        lastCell: cell,
        pitch,
        window: view.window,
        erased: active.erased,
        policy: midi,
      })
      active.erased = result.erased
      transaction.onChange(result.edit.notes)
    }
    active.lastPitch = pitch
    active.lastCell = cell
  }

  function begin(
    kind: GestureKind,
    event: EventPayload,
    origin: Gesture["origin"],
    selection: number[]
  ): Gesture {
    const view = latest.current
    const press = { x: event.x ?? origin.x, y: event.y ?? origin.y }
    const y = press.y - origin.y + view.scrollY
    const x = press.x - origin.x + view.scrollX
    const next: Gesture = {
      kind,
      origin,
      start: { x, y },
      notes: storedNotes(clip.id),
      selection,
      currentNoteIndex,
      pitch: pitchAt(y, view),
      lastPitch: pitchAt(y, view),
      lastCell: cellAt(x, view, midi.noteGridBeats),
      erased: new Set(),
    }
    gesture.current = next
    return next
  }

  function pressGrid(event: EventPayload) {
    if ((event.button ?? 0) !== 0 || gesture.current || !host.current) return
    renderer?.focusElement?.(host.current.id)
    const bounds = renderer?.getElementBounds?.(host.current.id)
    if (!bounds) return
    const view = latest.current
    const origin = { x: bounds.x, y: bounds.y }
    const x = (event.x ?? origin.x) - origin.x + view.scrollX
    const y = (event.y ?? origin.y) - origin.y + view.scrollY
    const hit = hitNote(clip.notes, view, x, y, view.rowHeight)
    const extend = Boolean(event.modifiers?.shift || event.modifiers?.cmd || event.modifiers?.ctrl)
    if ((event.clickCount ?? 1) >= 2 && !drawMode) {
      if (hit.kind === "note") {
        projectActions.updateClip(clip.id, { notes: deleteNotes(clip.notes, [hit.index]).notes })
        setSelected([], null)
        return
      }
      const pitch = pitchAt(y, view)
      const edit = insertNote({
        notes: storedNotes(clip.id),
        horizontalRatio: x / Math.max(1, view.width),
        verticalRatio: (127 - pitch + 0.5) / 128,
        window: view.window,
        id: uniqueId("note"),
        policy: midi,
      })
      projectActions.updateClip(clip.id, { notes: edit.notes })
      setSelected(edit.selection, edit.selection[0] ?? null)
      return
    }
    if (drawMode) {
      environment.drawMode.markGesture()
      transaction.onGestureStart()
      setSelected([], null)
      const active = begin(hit.kind === "note" ? "erase" : "draw", event, origin, [])
      if (hit.kind === "note") {
        active.erased = new Set([hit.index])
        transaction.onChange(deleteNotes(active.notes, [hit.index]).notes)
      } else {
        active.lastPitch = Number.NaN
        move(event)
      }
      return
    }
    if (hit.kind === "note") {
      const selection = selectHit(visibleSelection, hit.index, extend)
      setSelected(selection, selection.includes(hit.index) ? hit.index : currentNoteIndex)
      if (selection.includes(hit.index) && !extend) {
        transaction.onGestureStart()
        begin(hit.edge ? "resize" : "move", event, origin, selection)
      }
      return
    }
    const selection = extend ? visibleSelection : []
    setSelected(selection, currentNoteIndex)
    begin("marquee", event, origin, selection)
  }

  function pressVelocity(event: EventPayload) {
    if ((event.button ?? 0) !== 0 || gesture.current || !velocityHost.current) return
    const bounds = renderer?.getElementBounds?.(velocityHost.current.id)
    if (!bounds) return
    const view = latest.current
    const x = (event.x ?? bounds.x) - bounds.x + view.scrollX
    const y = (event.y ?? bounds.y) - bounds.y
    const index = velocityStemAt(clip.notes, visibleSelection, view, x, y, velocityHeight)
    if (index === null) return
    if (host.current) renderer?.focusElement?.(host.current.id)
    const selection = visibleSelection.includes(index) ? visibleSelection : [index]
    setSelected(selection, index)
    transaction.onGestureStart()
    begin("velocity", event, { x: bounds.x, y: bounds.y }, selection)
    move(event)
  }

  function command(key: string, shift: boolean): boolean {
    const notes = clip.notes
    const view = latest.current
    switch (key) {
      case "z":
        if (gesture.current) finish(true)
        else (shift ? projectActions.redo : projectActions.undo)()
        return true
      case "a":
        setSelected(selectVisibleNotes(notes, view.window), currentNoteIndex)
        return true
      case "d": {
        if (!visibleSelection.length) return false
        const edit = duplicateNotes(notes, visibleSelection, () => uniqueId("note"))
        projectActions.updateClip(clip.id, { notes: edit.notes })
        setSelected(edit.selection, edit.selection[0] ?? null)
        return true
      }
      case "u":
        if (!visibleSelection.length) return false
        projectActions.updateClip(clip.id, {
          notes: quantizeNotes({
            notes,
            selection: visibleSelection,
            gridBeats: midi.quantizeBeats,
            window: view.window,
          }).notes,
        })
        return true
      case "c":
      case "x": {
        if (!visibleSelection.length) return false
        const text = serializeNotes(visibleSelection.map(index => notes[index]).filter(Boolean))
        environment.clipboard.writeText(text)
        clipboardMemory.write(text)
        if (key === "x") {
          projectActions.updateClip(clip.id, { notes: deleteNotes(notes, visibleSelection).notes })
          setSelected([], null)
        }
        return true
      }
      case "v": {
        const text = environment.clipboard.readText() ?? ""
        clipboardMemory.write(text)
        const copied = parseNotes(text)
        if (!copied) return false
        const edit = pasteNotes(notes, copied, () => uniqueId("note"), midi)
        projectActions.updateClip(clip.id, { notes: edit.notes })
        setSelected(edit.selection, edit.selection[0] ?? null)
        return true
      }
      default:
        return false
    }
  }

  function keyDown(event: KeyEvent) {
    const key = event.key ?? ""
    const modifiers = event.modifiers
    const commandKey = Boolean(modifiers?.cmd || modifiers?.ctrl)
    const mutatesNotes = commandKey
      ? Object.hasOwn(DRAG_BLOCKED_COMMANDS, key)
      : key === "delete" || key === "backspace" || Object.hasOwn(MOVE_KEYS, key)
    if (gesture.current && mutatesNotes && !modifiers?.alt) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    let handled = false
    if (key === "escape") {
      if (gesture.current) finish(true)
      else setSelected([], null)
      handled = true
    } else if (commandKey && !modifiers?.alt) {
      handled = command(key, Boolean(modifiers?.shift))
    } else if (!modifiers?.alt && visibleSelection.length) {
      if (key === "delete" || key === "backspace") {
        projectActions.updateClip(clip.id, {
          notes: deleteNotes(clip.notes, visibleSelection).notes,
        })
        setSelected([], null)
        handled = true
      } else if (Object.hasOwn(MOVE_KEYS, key)) {
        const [beatDelta, pitchStep] = MOVE_KEYS[key] ?? [0, 0]
        projectActions.updateClip(clip.id, {
          notes: transformNotes({
            notes: clip.notes,
            selection: visibleSelection,
            kind: "move",
            beatDelta: beatDelta * midi.noteGridBeats,
            policy: midi,
            pitchDelta: pitchStep * (modifiers?.shift ? 12 : 1),
            window: latest.current.window,
          }).notes,
        })
        handled = true
      }
    }
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return {
    host,
    velocityHost,
    drawMode,
    marquee,
    visibleSelection,
    currentNoteIndex,
    finish,
    blur: () => {
      // Native preview repaint can report a transient null focus; application loss has its own port.
      const focused = renderer?.getFocusedElementId?.()
      if (focused !== undefined && focused !== null && focused !== host.current?.id) finish(true)
    },
    keyDown,
    pressGrid,
    pressVelocity,
    move,
    release: () => finish(false),
    latchDraw: (enabled: boolean) => {
      finish(true)
      environment.drawMode.latch(enabled)
    },
    selectPitch: (pitch: number, extend: boolean, source: "pointer" | "keyboard") => {
      const indices = selectVisibleNotes(clip.notes, latest.current.window).filter(
        index => clip.notes[index]?.pitch === pitch
      )
      setSelected(
        extend ? [...new Set([...visibleSelection, ...indices])] : indices,
        indices[0] ?? currentNoteIndex
      )
      if (source === "pointer" && host.current) renderer?.focusElement?.(host.current.id)
    },
    activateNote: (index: number, preserveSelection: boolean) => {
      if (index < 0 || index >= clip.notes.length) return
      setSelected(
        preserveSelection && visibleSelection.includes(index) ? visibleSelection : [index],
        index
      )
    },
    changeVelocity: (index: number, delta: number) => {
      const note = clip.notes[index]
      if (!note) return
      const selection = visibleSelection.includes(index) ? visibleSelection : [index]
      finish(true)
      setSelected(selection, index)
      projectActions.updateClip(clip.id, {
        notes: setNoteVelocity(storedNotes(clip.id), selection, note.velocity + delta).notes,
      })
    },
    /** Applies one velocity to the selection as a single undo entry (numeric control path). */
    velocityGesture: transaction,
    setSelectedVelocity: (value: number) =>
      transaction.onChange(setNoteVelocity(storedNotes(clip.id), visibleSelection, value).notes),
  }
}

/**
Velocity stem under a lane point. Stems sharing an x (chords) are told apart by their handle height;
a selected note wins a tie so its handle stays draggable over a coincident louder note.
*/
export function velocityStemAt(
  notes: readonly MidiNote[],
  selection: readonly number[],
  roll: Pick<RollGeometry, "width" | "window">,
  x: number,
  y: number,
  height: number
): number | null {
  const { sourceOffsetBeats, totalBeats } = roll.window
  const reach = Math.max(1, height / 8)
  let best: { index: number; distance: number; selected: boolean } | null = null
  for (const [index, note] of notes.entries()) {
    if (
      note.startBeat >= sourceOffsetBeats + totalBeats ||
      note.startBeat + note.lengthBeats <= sourceOffsetBeats
    )
      continue
    const stemX =
      ((Math.max(note.startBeat, sourceOffsetBeats) - sourceOffsetBeats) / totalBeats) * roll.width
    if (Math.abs(x - stemX) > reach) continue
    const distance = Math.abs(y - height * (1 - note.velocity / 127))
    const isSelected = selection.includes(index)
    if (
      !best ||
      distance < best.distance - 0.5 ||
      (Math.abs(distance - best.distance) <= 0.5 && isSelected && !best.selected)
    )
      best = { index, distance, selected: isSelected }
  }
  return best?.index ?? null
}
