import type { CommandId, CommandInput } from "./commands"

export type KeyboardFocus = "text" | "menu" | "control" | "timeline" | "clip-editor"
export interface KeyboardContext {
  readonly focus: KeyboardFocus
  readonly computerKeyboard: boolean
  readonly browserSearch: boolean
}
export interface ContextPredicate {
  readonly focus?: readonly KeyboardFocus[]
  readonly computerKeyboard?: boolean
  readonly browserSearch?: boolean
}
export interface KeyBinding {
  readonly keys: string
  readonly command: CommandId
  readonly context: ContextPredicate
}

export interface Keymap {
  readonly bindings: readonly KeyBinding[]
  resolve(event: CommandInput, context: KeyboardContext): CommandId | undefined
  formatKeys(command: CommandId): string
}

const FOCUS: readonly KeyboardFocus[] = ["text", "menu", "control", "timeline", "clip-editor"]
const KEY_NAMES: Readonly<Record<string, string>> = {
  " ": "space",
}

export function normalizeKey(key: string | undefined): string {
  const lower = key?.toLowerCase() ?? ""
  return KEY_NAMES[lower] ?? lower
}

function accepts(predicate: ContextPredicate, context: KeyboardContext): boolean {
  return (
    (!predicate.focus || predicate.focus.includes(context.focus)) &&
    (predicate.computerKeyboard === undefined ||
      predicate.computerKeyboard === context.computerKeyboard) &&
    (predicate.browserSearch === undefined || predicate.browserSearch === context.browserSearch)
  )
}

function overlaps(a: ContextPredicate, b: ContextPredicate): boolean {
  return FOCUS.some(focus =>
    [false, true].some(computerKeyboard =>
      [false, true].some(browserSearch => {
        const context = { focus, computerKeyboard, browserSearch }
        return accepts(a, context) && accepts(b, context)
      })
    )
  )
}

function compileKeys(keys: string) {
  const parts = keys.toLowerCase().split("+")
  const key = normalizeKey(parts.pop())
  const allowed = ["mod", "ctrl", "cmd", "alt", "shift", "shift?"]
  if (!key || parts.some(part => !allowed.includes(part)) || new Set(parts).size !== parts.length)
    throw new Error(`Invalid key binding: ${keys}`)
  if (parts.includes("mod") && (parts.includes("ctrl") || parts.includes("cmd")))
    throw new Error(`Mod cannot be combined with Ctrl or Cmd: ${keys}`)
  if (parts.includes("shift") && parts.includes("shift?"))
    throw new Error(`Shift cannot be both required and optional: ${keys}`)
  let masks = 0
  for (let modifiers = 0; modifiers < 16; modifiers++) {
    const shift = Boolean(modifiers & 1)
    const ctrl = Boolean(modifiers & 2)
    const alt = Boolean(modifiers & 4)
    const cmd = Boolean(modifiers & 8)
    if (
      (parts.includes("shift?") || shift === parts.includes("shift")) &&
      alt === parts.includes("alt") &&
      (parts.includes("mod")
        ? ctrl || cmd
        : ctrl === parts.includes("ctrl") && cmd === parts.includes("cmd"))
    )
      masks |= 1 << modifiers
  }
  return { key, masks }
}

export function createKeymap(bindings: readonly KeyBinding[]): Keymap {
  const compiled = bindings.map(binding => ({ ...binding, ...compileKeys(binding.keys) }))
  for (let index = 0; index < compiled.length; index++) {
    const a = compiled[index]
    if (!a) continue
    for (const b of compiled.slice(index + 1)) {
      if (a.key === b.key && (a.masks & b.masks) !== 0 && overlaps(a.context, b.context))
        throw new Error(`Conflicting key binding ${a.keys}: ${a.command} / ${b.command}`)
    }
  }
  return {
    bindings,
    resolve(event: CommandInput, context: KeyboardContext): CommandId | undefined {
      if (event.defaultPrevented) return undefined
      const key = normalizeKey(event.key)
      const modifiers = event.modifiers
      const mask =
        (modifiers?.shift ? 1 : 0) |
        (modifiers?.ctrl ? 2 : 0) |
        (modifiers?.alt ? 4 : 0) |
        (modifiers?.cmd ? 8 : 0)
      return compiled.find(
        binding =>
          binding.key === key &&
          (binding.masks & (1 << mask)) !== 0 &&
          accepts(binding.context, context)
      )?.command
    },
    formatKeys(command: CommandId): string {
      const binding = compiled.find(candidate => candidate.command === command)
      if (!binding) return ""
      return binding.keys
        .split("+")
        .filter(part => part.toLowerCase() !== "shift?")
        .map(part => {
          if (part.toLowerCase() === "mod") return "Cmd/Ctrl"
          if (part.length === 1) return part.toUpperCase()
          return part[0]?.toUpperCase() + part.slice(1).toLowerCase()
        })
        .join("+")
    },
  }
}
