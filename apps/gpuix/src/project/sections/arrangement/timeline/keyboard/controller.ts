import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import type { ArrangementPolicy } from "@/project/defaults/arrangement"
import { projectActions, useProjectState } from "@/project/adapters"
import { deriveGridPlan } from "@/project/model/grid"
import { positionToBar } from "@/project/model/types"
import {
  createCommandRegistry,
  DEFAULT_KEYMAP,
  COMPUTER_NOTE_KEYS,
  normalizeKey,
} from "@/platform/keyboard"
import type { CommandHandler, CommandInput, KeyboardFocus } from "@/platform/keyboard"
import type { DockCommand } from "@/ui/panels"

export type { KeyboardFocus } from "@/platform/keyboard"
export type TimelineKeyboardInput = CommandInput

export interface KeyboardOwner {
  markDrawGesture: () => void
  latchDraw: (enabled: boolean) => void
  down: (event: TimelineKeyboardInput) => boolean
  up: (event: TimelineKeyboardInput) => boolean
  deactivate: () => void
  dispose: () => void
}

export interface TimelineKeyboardDeps {
  readPolicy?: () => ArrangementPolicy["keyboard"]
  focus: () => KeyboardFocus
  blurControl: () => void
  claim?: (event: TimelineKeyboardInput) => boolean
  browserSearch?: { available: () => boolean; focus: () => void }
  executeDockCommand?: (command: DockCommand) => boolean
}

export function createTimelineKeyboard({
  focus,
  readPolicy = () => ARRANGEMENT_DEFAULTS.keyboard,
  blurControl,
  claim = () => false,
  browserSearch,
  executeDockCommand,
}: TimelineKeyboardDeps): KeyboardOwner {
  const notes = new Map<string, number>()
  let draw: { key: string; original: boolean; used: boolean } | null = null

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

  const once =
    (action: () => void): CommandHandler =>
    event => {
      if (!event.isHeld) action()
      return "handled"
    }
  const local =
    (handler: CommandHandler): CommandHandler =>
    event => {
      if (focus() === "timeline" && claim(event)) return "handled"
      return handler(event)
    }
  const seek =
    (direction: -1 | 1): CommandHandler =>
    () => {
      const state = useProjectState.getState()
      const { numerator, denominator } = state.document.transport
      const plan = deriveGridPlan(
        state.workspace.grid,
        state.workspace.pxPerBar,
        numerator,
        denominator
      )
      projectActions.seekBar(
        Math.max(1, positionToBar(state.session.position, numerator) + direction * plan.cellBars)
      )
      return "handled"
    }
  const dock = (command: DockCommand): CommandHandler => event => {
    if (!executeDockCommand) return "pass"
    if (event.isHeld) return "handled"
    return executeDockCommand(command) ? "handled" : "pass"
  }
  const commands = createCommandRegistry({
    "dock.moveLeft": dock("moveLeft"),
    "dock.moveRight": dock("moveRight"),
    "dock.moveUp": dock("moveUp"),
    "dock.moveDown": dock("moveDown"),
    "dock.toggleMaximize": dock("toggleMaximize"),
    "dock.close": dock("close"),
    "dock.hide": dock("hide"),
    "project.save": once(projectActions.save),
    "project.saveAs": once(projectActions.requestSaveAs),
    "project.open": once(projectActions.requestOpen),
    "transport.togglePlay": event => {
      blurControl()
      if (!event.isHeld) projectActions.togglePlay()
      return "handled"
    },
    "arrangement.draw": event => {
      if (!draw && !event.isHeld) {
        draw = {
          key: normalizeKey(event.key),
          original: useProjectState.getState().workspace.drawMode,
          used: false,
        }
        projectActions.setDrawModeOverride(!draw.original)
      }
      return "handled"
    },
    "edit.undo": local(once(projectActions.undo)),
    "edit.redo": local(once(projectActions.redo)),
    "grid.narrow": local(once(() => projectActions.adjustGrid(-1))),
    "grid.widen": local(once(() => projectActions.adjustGrid(1))),
    "grid.toggleSnap": local(
      once(() => projectActions.setSnap(!useProjectState.getState().workspace.snap))
    ),
    "edit.split": local(() =>
      useProjectState.getState().session.selectedClipIds.length ? "pass" : "handled"
    ),
    "edit.cancel": local(() => {
      release()
      projectActions.setEditingClip(null)
      projectActions.cancelEdit()
      return "handled"
    }),
    "transport.rewind": local(() => {
      projectActions.rewindToStart()
      return "handled"
    }),
    "computerKeyboard.toggle": local(
      once(() =>
        projectActions.setMode(
          "computerKeyboard",
          !useProjectState.getState().workspace.computerKeyboard
        )
      )
    ),
    "computerKeyboard.octaveDown": local(
      once(() => projectActions.setMidiOctave(useProjectState.getState().session.midiOctave - 1))
    ),
    "computerKeyboard.octaveUp": local(
      once(() => projectActions.setMidiOctave(useProjectState.getState().session.midiOctave + 1))
    ),
    "computerKeyboard.velocityDown": local(
      once(() =>
        projectActions.setMidiVelocity(
          useProjectState.getState().session.midiVelocity - readPolicy().velocityStep
        )
      )
    ),
    "computerKeyboard.velocityUp": local(
      once(() =>
        projectActions.setMidiVelocity(
          useProjectState.getState().session.midiVelocity + readPolicy().velocityStep
        )
      )
    ),
    "computerKeyboard.note": local(event => {
      const key = normalizeKey(event.key)
      const semitone = COMPUTER_NOTE_KEYS[key]
      if (semitone === undefined) return "pass"
      const pitch = (useProjectState.getState().session.midiOctave + 1) * 12 + semitone
      if (!event.isHeld && !notes.has(key) && pitch <= 127) {
        notes.set(key, pitch)
        projectActions.noteOn(pitch)
      }
      return "handled"
    }),
    "arrangement.toggleAutomation": local(
      once(() =>
        projectActions.setMode(
          "automationMode",
          !useProjectState.getState().workspace.automationMode
        )
      )
    ),
    "transport.seekLeft": local(seek(-1)),
    "transport.seekRight": local(seek(1)),
    "browser.focusSearch": event => {
      if (!browserSearch) return "pass"
      if (!event.isHeld) browserSearch.focus()
      return "handled"
    },
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
      if (event.defaultPrevented) return false
      const target = focus()
      const command = DEFAULT_KEYMAP.resolve(event, {
        focus: target,
        computerKeyboard: useProjectState.getState().workspace.computerKeyboard,
        browserSearch: browserSearch?.available() ?? false,
      })
      if (command) return commands.execute(command, event) === "handled"
      return target === "timeline" && claim(event)
    },
    up(event: TimelineKeyboardInput): boolean {
      const key = normalizeKey(event.key)
      if (!key) return false
      const pitch = notes.get(key)
      if (pitch !== undefined) {
        notes.delete(key)
        projectActions.noteOff(pitch)
        return true
      }
      if (draw?.key === key) {
        const previous = draw
        draw = null
        if (!previous.used) projectActions.setMode("drawMode", !previous.original)
        projectActions.setDrawModeOverride(null)
        return true
      }
      return (
        DEFAULT_KEYMAP.resolve(
          { ...event, defaultPrevented: false },
          {
            focus: focus(),
            computerKeyboard: useProjectState.getState().workspace.computerKeyboard,
            browserSearch: false,
          }
        ) === "transport.togglePlay"
      )
    },
    deactivate: release,
    dispose() {
      unsubscribe()
      release()
    },
  }
}
