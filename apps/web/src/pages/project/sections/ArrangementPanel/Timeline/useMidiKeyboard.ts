import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { useEffect } from "react"
import { projectActions, useProjectState } from "@/pages/project/adapters"
import { isEditableTarget } from "../Grid/geometry"
type NativeEditorKeyboard = {
  kind: "keydown" | "keyup"
  key: string
  code: string
  repeat: boolean
}

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
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<NativeEditorKeyboard>("native-editor-keyboard", event => {
      window.dispatchEvent(
        new KeyboardEvent(event.payload.kind, {
          bubbles: true,
          cancelable: true,
          code: event.payload.code,
          key: event.payload.key,
          repeat: event.payload.repeat,
        })
      )
    })
      .then(stop => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch(() => {})
    void invoke("keyboard_bridge_set_midi_mode", {
      enabled: useProjectState.getState().workspace.computerKeyboard,
    }).catch(() => {})
    const unsubscribe = useProjectState.subscribe((state, previous) => {
      if (previous.workspace.computerKeyboard && !state.workspace.computerKeyboard) release()
      if (previous.workspace.computerKeyboard !== state.workspace.computerKeyboard) {
        void invoke("keyboard_bridge_set_midi_mode", {
          enabled: state.workspace.computerKeyboard,
        }).catch(() => {})
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
      projectActions.noteOn(pitch, "computerKeyboard")
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
      disposed = true
      unlisten?.()
      unsubscribe()
      release()
      window.removeEventListener("keydown", keyDown)
      window.removeEventListener("keyup", keyUp)
      window.removeEventListener("blur", release)
    }
  }, [])
}
