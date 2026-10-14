import { useEffect } from "react"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { isEditableTarget } from "../Grid/geometry"

export const noteKeys: Record<string, number> = {
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

export function useMidiKeyboard(): void {
  useEffect(() => {
    const held = new Map<string, number>()
    const release = () => {
      for (const pitch of held.values()) {
        projectActions.noteOff(pitch)
      }
      held.clear()
    }
    const unsubscribe = useProjectState.subscribe((state, previous) => {
      if (previous.workspace.computerKeyboard && !state.workspace.computerKeyboard) {
        release()
      }
    })
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest("[role=menu],[role=menuitem],[role=listbox]")) ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === "m") {
        if (event.repeat) {
          return
        }
        event.preventDefault()
        projectActions.setMode(
          "computerKeyboard",
          !useProjectState.getState().workspace.computerKeyboard
        )
        return
      }
      if (!useProjectState.getState().workspace.computerKeyboard) {
        return
      }
      if (key === "z" || key === "x") {
        if (event.repeat) {
          return
        }
        event.preventDefault()
        const octave = useProjectState.getState().session.midiOctave
        projectActions.setMidiOctave(octave + (key === "x" ? 1 : -1))
        return
      }
      if (key === "c" || key === "v") {
        if (event.repeat) {
          return
        }
        event.preventDefault()
        const velocity = useProjectState.getState().session.midiVelocity
        projectActions.setMidiVelocity(velocity + (key === "v" ? 10 : -10))
        return
      }
      const semitone = noteKeys[key]
      if (semitone === undefined || event.repeat || held.has(event.code)) {
        return
      }
      const pitch = (useProjectState.getState().session.midiOctave + 1) * 12 + semitone
      if (pitch > 127) {
        return
      }
      event.preventDefault()
      held.set(event.code, pitch)
      projectActions.noteOn(pitch)
    }
    const keyUp = (event: KeyboardEvent) => {
      const pitch = held.get(event.code)
      if (pitch === undefined) {
        return
      }
      event.preventDefault()
      held.delete(event.code)
      projectActions.noteOff(pitch)
    }
    window.addEventListener("keydown", keyDown)
    window.addEventListener("keyup", keyUp)
    window.addEventListener("blur", release)
    return () => {
      unsubscribe()
      release()
      window.removeEventListener("keydown", keyDown)
      window.removeEventListener("keyup", keyUp)
      window.removeEventListener("blur", release)
    }
  }, [])
}
