import { projectActions, useProjectState } from "@/project/adapters"
import { deriveGridPlan } from "@/project/model/grid"
import { positionToBar } from "@/project/model/types"
import type { WindowKeyEvent } from "@/platform/keyboard"

const NOTE_KEYS: Readonly<Record<string, number>> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
}

export type KeyboardFocus = "text" | "menu" | "control" | "timeline" | "clip-editor"

export type TimelineKeyboardInput = Pick<
  WindowKeyEvent,
  "key" | "keyChar" | "isHeld" | "modifiers" | "defaultPrevented"
>

export interface KeyboardOwner {
  markDrawGesture: () => void
  latchDraw: (enabled: boolean) => void
  down: (event: TimelineKeyboardInput) => boolean
  up: (event: TimelineKeyboardInput) => boolean
  deactivate: () => void
  dispose: () => void
}

export interface TimelineKeyboardDeps {
  focus: () => KeyboardFocus
  blurControl: () => void
  claim?: (event: TimelineKeyboardInput) => boolean
}

export function createTimelineKeyboard({
  focus,
  blurControl,
  claim = () => false,
}: TimelineKeyboardDeps): KeyboardOwner {
  const notes = new Map<string, number>()
  let draw: { original: boolean; used: boolean } | null = null

  function release() {
    for (const pitch of notes.values()) projectActions.noteOff(pitch)
    notes.clear()
    draw = null
    projectActions.setDrawModeOverride(null)
  }
  const unsubscribe = useProjectState.subscribe((next, previous) => {
    if (previous.workspace.computerKeyboard && !next.workspace.computerKeyboard) {
      for (const pitch of notes.values()) projectActions.noteOff(pitch)
      notes.clear()
    }
    if (next.session.editEpoch !== previous.session.editEpoch) release()
  })

  return {
    markDrawGesture() {
      if (draw) draw.used = true
    },
    latchDraw(enabled: boolean) {
      draw = null
      projectActions.setDrawModeOverride(null)
      projectActions.setMode("drawMode", enabled)
    },
    down(event: TimelineKeyboardInput): boolean {
      const key = event.key?.toLowerCase()
      const target = focus()
      if (!key || event.defaultPrevented || target === "text" || target === "menu") return false
      const { ctrl = false, cmd = false, alt = false, shift = false } = event.modifiers ?? {}
      const modified = ctrl || cmd
      if ((key === "space" || key === " ") && !modified && !alt) {
        blurControl()
        if (!event.isHeld) projectActions.togglePlay()
        return true
      }
      if (target === "clip-editor") return false
      if (claim(event)) return true
      const state = useProjectState.getState()
      if (modified) {
        if (alt) return false
        if (key === "s") {
          if (!event.isHeld) projectActions.saveSnapshot()
        } else if (key === "z") {
          if (!event.isHeld) (shift ? projectActions.redo : projectActions.undo)()
        } else if ((key === "1" || key === "2") && !shift) {
          if (!event.isHeld) projectActions.adjustGrid(key === "2" ? 1 : -1)
        } else if (key === "4" && !shift) {
          if (!event.isHeld) projectActions.setSnap(!state.workspace.snap)
        } else if (key === "e" && !shift && !state.session.selectedClipIds.length) {
          return true
        } else return false
        return true
      }
      if (alt) return false
      if (key === "escape") {
        release()
        projectActions.setEditingClip(null)
        projectActions.cancelEdit()
        return true
      }
      if (key === "home") {
        projectActions.rewindToStart()
        return true
      }
      if (key === "m") {
        if (!event.isHeld)
          projectActions.setMode("computerKeyboard", !state.workspace.computerKeyboard)
        return true
      }
      if (state.workspace.computerKeyboard) {
        if (key === "z" || key === "x") {
          if (!event.isHeld)
            projectActions.setMidiOctave(state.session.midiOctave + (key === "x" ? 1 : -1))
          return true
        }
        if (key === "c" || key === "v") {
          if (!event.isHeld)
            projectActions.setMidiVelocity(state.session.midiVelocity + (key === "v" ? 10 : -10))
          return true
        }
        const semitone = NOTE_KEYS[key]
        if (semitone !== undefined) {
          const pitch = (state.session.midiOctave + 1) * 12 + semitone
          if (!event.isHeld && !notes.has(key) && pitch <= 127) {
            notes.set(key, pitch)
            projectActions.noteOn(pitch)
          }
          return true
        }
      }
      if (key === "b") {
        if (state.workspace.computerKeyboard) return false
        if (!draw && !event.isHeld) {
          draw = { original: state.workspace.drawMode, used: false }
          projectActions.setDrawModeOverride(!draw.original)
        }
        return true
      }
      if (key === "a") {
        if (!event.isHeld) projectActions.setMode("automationMode", !state.workspace.automationMode)
        return true
      }
      if (key === "left" || key === "right") {
        const { numerator, denominator } = state.document.transport
        const plan = deriveGridPlan(
          state.workspace.grid,
          state.workspace.pxPerBar,
          numerator,
          denominator
        )
        projectActions.seekBar(
          Math.max(
            1,
            positionToBar(state.session.position, numerator) +
              (key === "right" ? plan.cellBars : -plan.cellBars)
          )
        )
        return true
      }
      return false
    },
    up(event: TimelineKeyboardInput): boolean {
      const key = event.key?.toLowerCase()
      if (!key) return false
      const pitch = notes.get(key)
      if (pitch !== undefined) {
        notes.delete(key)
        projectActions.noteOff(pitch)
        return true
      }
      if (key === "b" && draw) {
        const previous = draw
        draw = null
        if (!previous.used) projectActions.setMode("drawMode", !previous.original)
        projectActions.setDrawModeOverride(null)
        return true
      }
      const modifiers = event.modifiers
      return (
        (key === "space" || key === " ") &&
        focus() !== "text" &&
        focus() !== "menu" &&
        !modifiers?.ctrl &&
        !modifiers?.cmd &&
        !modifiers?.alt
      )
    },
    deactivate: release,
    dispose() {
      unsubscribe()
      release()
    },
  }
}
