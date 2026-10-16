import { createContext, useContext } from "react"

export { consumeKey } from "@/shared/keyboard"
export type { CommandResult } from "@/shared/keyboard"
export { COMMAND_IDS, createCommandRegistry } from "./commands"
export type { CommandId, CommandInput, CommandHandler, CommandDefinition } from "./commands"
export { createKeymap, normalizeKey } from "./keymap"
export type { KeyBinding, Keymap, KeyboardContext, KeyboardFocus, ContextPredicate } from "./keymap"
export { DEFAULT_BINDINGS, DEFAULT_KEYMAP, COMPUTER_NOTE_KEYS } from "./default-keymap"

/** Structural port: the application root injects renderer callbacks, not a renderer singleton. */
export interface WindowKeyEvent {
  readonly key?: string
  readonly keyChar?: string
  readonly isHeld?: boolean
  /** Native id shared by every element and window handler of one keystroke; correlates bubbling with the window phase. */
  readonly keystrokeId?: number
  readonly modifiers?: {
    readonly shift: boolean
    readonly ctrl: boolean
    readonly alt: boolean
    readonly cmd: boolean
  }
  readonly defaultPrevented: boolean
  preventDefault(): void
  stopPropagation(): void
}

export type WindowKeyListener = (event: WindowKeyEvent) => void
export type WindowKeyPhase = "keyDown" | "keyUp"

export interface WindowKeyboard {
  subscribe(phase: WindowKeyPhase, listener: WindowKeyListener): () => void
  readonly rootHandlers: {
    readonly onKeyDown: WindowKeyListener
    readonly onKeyUp: WindowKeyListener
  }
}

/** One instance per render root; subscriptions live until their returned cleanup runs. */
export function createWindowKeyboard(): WindowKeyboard {
  const listeners = {
    keyDown: new Set<WindowKeyListener>(),
    keyUp: new Set<WindowKeyListener>(),
  }
  const dispatch = (phase: WindowKeyPhase, event: WindowKeyEvent) => {
    for (const listener of listeners[phase]) {
      if (event.defaultPrevented) break
      listener(event)
    }
  }
  return {
    subscribe(phase: WindowKeyPhase, listener: WindowKeyListener) {
      listeners[phase].add(listener)
      return () => {
        listeners[phase].delete(listener)
      }
    },
    rootHandlers: {
      onKeyDown: (event: WindowKeyEvent) => dispatch("keyDown", event),
      onKeyUp: (event: WindowKeyEvent) => dispatch("keyUp", event),
    },
  }
}

const WindowKeyboardContext = createContext<WindowKeyboard | null>(null)
export const WindowKeyboardProvider = WindowKeyboardContext.Provider

/** Sections subscribe inside an effect and return its unsubscribe function. */
export function useWindowKeyboard(): WindowKeyboard {
  const keyboard = useContext(WindowKeyboardContext)
  if (!keyboard) throw new Error("WindowKeyboardProvider is missing at the application render root")
  return keyboard
}
