import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { projectActions, useProjectState } from "../../../../adapters"
import { createMockDocument, createMockWorkspace } from "../../../../adapters/fixtures"
import { initialSession, useProjectState as projectStore } from "../../../../stores/useProjectState"
import { createTimelineKeyboard } from "./controller"
import type { KeyboardFocus, KeyboardOwner } from "./controller"
import type { EventPayload } from "@gpuix/react"

let focus: KeyboardFocus = "timeline"
let keyboard: KeyboardOwner

function key(value: string, modifiers?: EventPayload["modifiers"], isHeld = false): EventPayload {
  return { elementId: 0, eventType: "keyDown", key: value, modifiers, isHeld }
}

beforeEach(() => {
  projectStore.setState({
    document: createMockDocument(),
    workspace: createMockWorkspace(),
    session: initialSession(),
  })
  focus = "timeline"
  keyboard = createTimelineKeyboard({
    focus: () => focus,
    blurControl: () => {
      focus = "timeline"
    },
  })
})
afterEach(() => keyboard.dispose())

const control = { ctrl: true, cmd: false, alt: false, shift: false }

describe("Arrangement keyboard boundaries", () => {
  test("Space exclusively controls transport, ignores repeats, releases control focus and preserves text input", () => {
    focus = "control"
    expect(keyboard.down(key("space"))).toBe(true)
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(String(focus)).toBe("timeline")
    keyboard.down(key("space", undefined, true))
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(keyboard.up(key("space"))).toBe(true)
    focus = "text"
    expect(keyboard.down(key("space"))).toBe(false)
    expect(keyboard.up(key("space"))).toBe(false)
    focus = "timeline"
    expect(keyboard.down(key("space", control))).toBe(false)
    keyboard.down(key("space"))
    expect(useProjectState.getState().session.playing).toBe(false)
  })

  test("a B tap latches; a held B used during a gesture is temporary; blur cancels it", () => {
    const original = useProjectState.getState().workspace.drawMode
    keyboard.down(key("b"))
    expect(useProjectState.getState().session.drawModeOverride).toBe(!original)
    keyboard.up(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(!original)
    keyboard.down(key("b"))
    keyboard.markDrawGesture()
    keyboard.up(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(!original)
    expect(useProjectState.getState().session.drawModeOverride).toBeNull()
    keyboard.down(key("b"))
    keyboard.deactivate()
    expect(useProjectState.getState().session.drawModeOverride).toBeNull()
    expect(useProjectState.getState().workspace.drawMode).toBe(!original)
  })

  test("MIDI input wins over arrangement commands and releases notes after mode-off or text focus", () => {
    projectActions.setMode("computerKeyboard", true)
    const automation = useProjectState.getState().workspace.automationMode
    keyboard.down(key("a"))
    expect(useProjectState.getState().workspace.automationMode).toBe(automation)
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([60])
    keyboard.down(key("a", undefined, true))
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([60])
    focus = "text"
    expect(keyboard.up(key("a"))).toBe(true)
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
    focus = "timeline"
    keyboard.down(key("s"))
    projectActions.setMode("computerKeyboard", false)
    expect(useProjectState.getState().session.activeMidiNotes).toEqual([])
    const octave = useProjectState.getState().session.midiOctave
    projectActions.setMode("computerKeyboard", true)
    keyboard.down(key("x"))
    expect(useProjectState.getState().session.midiOctave).toBe(octave + 1)
  })

  test("Ctrl+1 reaches 1/256 independently of pointer state while unselected Ctrl+E never edits grid", () => {
    projectActions.setMode("computerKeyboard", false)
    projectActions.setGrid({ mode: "fixed", bars: 1 / 4 })
    const position = useProjectState.getState().session.position
    expect(keyboard.down(key("e", control))).toBe(true)
    expect(useProjectState.getState().workspace.grid).toEqual({ mode: "fixed", bars: 1 / 4 })
    for (let i = 0; i < 12; i++) expect(keyboard.down(key("1", control))).toBe(true)
    expect(useProjectState.getState().workspace.grid).toEqual({ mode: "fixed", bars: 1 / 256 })
    expect(useProjectState.getState().session.position).toEqual(position)
    expect(keyboard.down(key("ctrl"))).toBe(false)
  })

  test("focused menus retain commands except Space and arrows never seek below bar one", () => {
    focus = "menu"
    expect(keyboard.down(key("a"))).toBe(false)
    expect(keyboard.down(key("left"))).toBe(false)
    focus = "timeline"
    projectActions.rewindToStart()
    keyboard.down(key("left"))
    expect(useProjectState.getState().session.position.bar).toBe(1)
    keyboard.down(key("right"))
    expect(useProjectState.getState().session.position).not.toEqual({
      bar: 1,
      beat: 1,
      sixteenth: 1,
    })
  })
})
