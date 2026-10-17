import { createKeymap } from "./keymap"
import type { ContextPredicate, KeyBinding } from "./keymap"

export const COMPUTER_NOTE_KEYS: Readonly<Record<string, number>> = {
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

const project: ContextPredicate = { focus: ["control", "timeline", "clip-editor"] }
const arrangement: ContextPredicate = { focus: ["control", "timeline"] }
const computer: ContextPredicate = { ...arrangement, computerKeyboard: true }

export const DEFAULT_BINDINGS: readonly KeyBinding[] = [
  { keys: "Alt+Mod+Left", command: "dock.moveLeft", context: { focus: ["dock"] } },
  { keys: "Alt+Mod+Right", command: "dock.moveRight", context: { focus: ["dock"] } },
  { keys: "Alt+Mod+Up", command: "dock.moveUp", context: { focus: ["dock"] } },
  { keys: "Alt+Mod+Down", command: "dock.moveDown", context: { focus: ["dock"] } },
  { keys: "Shift+Mod+Enter", command: "dock.toggleMaximize", context: { focus: ["dock"] } },
  { keys: "Mod+W", command: "dock.close", context: { focus: ["dock"] } },
  { keys: "Shift+Mod+H", command: "dock.hide", context: { focus: ["dock"] } },
  { keys: "Mod+S", command: "project.save", context: project },
  { keys: "Shift+Mod+S", command: "project.saveAs", context: project },
  { keys: "Shift?+Mod+O", command: "project.open", context: project },
  { keys: "Shift?+Space", command: "transport.togglePlay", context: project },
  {
    keys: "Shift?+B",
    command: "arrangement.draw",
    context: { ...project, computerKeyboard: false },
  },
  { keys: "Mod+Z", command: "edit.undo", context: arrangement },
  { keys: "Shift+Mod+Z", command: "edit.redo", context: arrangement },
  { keys: "Mod+1", command: "grid.narrow", context: arrangement },
  { keys: "Mod+2", command: "grid.widen", context: arrangement },
  { keys: "Mod+4", command: "grid.toggleSnap", context: arrangement },
  { keys: "Mod+E", command: "edit.split", context: arrangement },
  { keys: "Shift?+Escape", command: "edit.cancel", context: arrangement },
  { keys: "Shift?+Home", command: "transport.rewind", context: arrangement },
  { keys: "Shift?+M", command: "computerKeyboard.toggle", context: arrangement },
  { keys: "Shift?+Z", command: "computerKeyboard.octaveDown", context: computer },
  { keys: "Shift?+X", command: "computerKeyboard.octaveUp", context: computer },
  { keys: "Shift?+C", command: "computerKeyboard.velocityDown", context: computer },
  { keys: "Shift?+V", command: "computerKeyboard.velocityUp", context: computer },
  ...Object.keys(COMPUTER_NOTE_KEYS).map((key): KeyBinding => ({
    keys: `Shift?+${key}`,
    command: "computerKeyboard.note",
    context: computer,
  })),
  {
    keys: "Shift?+A",
    command: "arrangement.toggleAutomation",
    context: { ...arrangement, computerKeyboard: false },
  },
  { keys: "Shift?+Left", command: "transport.seekLeft", context: arrangement },
  { keys: "Shift?+Right", command: "transport.seekRight", context: arrangement },
  {
    keys: "Mod+F",
    command: "browser.focusSearch",
    context: { focus: ["text", "control", "timeline", "clip-editor"], browserSearch: true },
  },
]

export const DEFAULT_KEYMAP = createKeymap(DEFAULT_BINDINGS)
