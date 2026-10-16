import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createTimelineKeyboard } from "./controller"
import type { KeyboardFocus, KeyboardOwner, TimelineKeyboardInput } from "./controller"

let focus: KeyboardFocus = "timeline"
let keyboard: KeyboardOwner

function key(
  value: string,
  modifiers?: TimelineKeyboardInput["modifiers"],
  isHeld = false
): TimelineKeyboardInput {
  return { key: value, modifiers, isHeld, defaultPrevented: false }
}

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  focus = "timeline"
  keyboard = createTimelineKeyboard({
    focus: () => focus,
    blurControl: () => {
      focus = "timeline"
    },
  })
})
afterEach(() => keyboard.dispose())

test("computer keyboard velocity follows the injected step and ignores repeated presses", () => {
  keyboard.dispose()
  keyboard = createTimelineKeyboard({
    focus: () => "timeline",
    blurControl: () => {},
    readPolicy: () => ({ ...ARRANGEMENT_DEFAULTS.keyboard, velocityStep: 3 }),
  })
  projectActions.setMode("computerKeyboard", true)
  projectActions.setMidiVelocity(100)
  keyboard.down(key("v"))
  expect(useProjectState.getState().session.midiVelocity).toBe(103)
  keyboard.down(key("v", undefined, true))
  expect(useProjectState.getState().session.midiVelocity).toBe(103)
  keyboard.down(key("c"))
  expect(useProjectState.getState().session.midiVelocity).toBe(100)
})

const control = { ctrl: true, cmd: false, alt: false, shift: false }

describe("Arrangement keyboard boundaries", () => {
  test("text focus leaves a, Cmd+A and digits to the native editor", () => {
    focus = "text"
    const before = useProjectState.getState()
    for (const event of [key("a"), key("a", { ...control, ctrl: false, cmd: true }), key("5")]) {
      expect(keyboard.down(event)).toBe(false)
    }
    expect(useProjectState.getState().workspace).toEqual(before.workspace)
    expect(useProjectState.getState().session.drawModeOverride).toBeNull()
    expect(useProjectState.getState().session.position).toEqual(before.session.position)
  })

  test("computer MIDI mode keeps B from changing the draw preference or held override", () => {
    projectActions.setMode("computerKeyboard", true)
    const original = useProjectState.getState().workspace.drawMode
    expect(keyboard.down(key("b"))).toBe(false)
    keyboard.up(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(original)
    expect(useProjectState.getState().session.drawModeOverride).toBeNull()
  })

  test("Ctrl+4 toggles snap without changing grid or musical position", () => {
    const before = useProjectState.getState()
    expect(keyboard.down(key("4", control))).toBe(true)
    expect(useProjectState.getState().workspace.snap).toBe(!before.workspace.snap)
    expect(useProjectState.getState().workspace.grid).toEqual(before.workspace.grid)
    expect(useProjectState.getState().session.position).toEqual(before.session.position)
    keyboard.down(key("4", control))
    expect(useProjectState.getState().workspace.snap).toBe(before.workspace.snap)
  })

  test("an already consumed native key cannot toggle transport again", () => {
    expect(keyboard.down({ ...key("space"), defaultPrevented: true })).toBe(false)
    expect(useProjectState.getState().session.playing).toBe(false)
  })

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

  for (const used of [false, true]) {
    test(`clip-editor B ${used ? "drawing is temporary" : "tap latches"}`, () => {
      focus = "clip-editor"
      const original = useProjectState.getState().workspace.drawMode
      expect(keyboard.down(key("b"))).toBe(true)
      expect(useProjectState.getState().session.drawModeOverride).toBe(!original)
      expect(useProjectState.getState().workspace.drawMode).toBe(original)
      keyboard.down(key("b", undefined, true))
      if (used) keyboard.markDrawGesture()
      expect(keyboard.up(key("b"))).toBe(true)
      expect(useProjectState.getState().session.drawModeOverride).toBeNull()
      expect(useProjectState.getState().workspace.drawMode).toBe(used ? original : !original)
      expect(useProjectState.getState().session.canUndo).toBe(!used)
      if (!used) {
        projectActions.undo()
        expect(useProjectState.getState().workspace.drawMode).toBe(original)
      }
    })
  }

  test("a tapped B creates one preference undo entry", () => {
    hydrateProject(
      JSON.stringify({
        version: 2,
        document: createMockDocument(),
        workspace: { ...createMockWorkspace(), drawMode: false, computerKeyboard: false },
      })
    )
    keyboard.down(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(false)
    keyboard.up(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(true)
    projectActions.undo()
    expect(useProjectState.getState().workspace.drawMode).toBe(false)
    expect(useProjectState.getState().session.canUndo).toBe(false)
  })

  test("used held B is excluded from an authored edit snapshot and adds no tool history", () => {
    hydrateProject(
      JSON.stringify({
        version: 2,
        document: createMockDocument(),
        workspace: { ...createMockWorkspace(), drawMode: false, computerKeyboard: false },
      })
    )
    keyboard.down(key("b"))
    keyboard.markDrawGesture()
    projectActions.beginEdit()
    projectActions.setBpm(130)
    projectActions.endEdit()
    keyboard.up(key("b"))
    expect(useProjectState.getState().workspace.drawMode).toBe(false)
    expect(useProjectState.getState().session.drawModeOverride).toBeNull()
    projectActions.undo()
    expect(useProjectState.getState().document.transport.bpm).toBe(120)
    expect(useProjectState.getState().workspace.drawMode).toBe(false)
    expect(useProjectState.getState().session.canUndo).toBe(false)
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

  test("focused menus retain their keys and arrows never seek below bar one", () => {
    focus = "menu"
    expect(keyboard.down(key("a"))).toBe(false)
    expect(keyboard.down(key("left"))).toBe(false)
    expect(keyboard.down(key("space"))).toBe(false)
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
