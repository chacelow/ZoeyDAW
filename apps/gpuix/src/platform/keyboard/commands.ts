import type { CommandResult } from "@/shared/keyboard"
import type { WindowKeyEvent } from "./index"

export const COMMAND_IDS = [
  "project.save",
  "project.saveAs",
  "project.open",
  "transport.togglePlay",
  "edit.undo",
  "edit.redo",
  "grid.narrow",
  "grid.widen",
  "grid.toggleSnap",
  "edit.split",
  "edit.cancel",
  "transport.rewind",
  "computerKeyboard.toggle",
  "computerKeyboard.octaveDown",
  "computerKeyboard.octaveUp",
  "computerKeyboard.velocityDown",
  "computerKeyboard.velocityUp",
  "computerKeyboard.note",
  "arrangement.toggleAutomation",
  "arrangement.draw",
  "transport.seekLeft",
  "transport.seekRight",
  "browser.focusSearch",
] as const

export type CommandId = (typeof COMMAND_IDS)[number]
export type CommandInput = Pick<
  WindowKeyEvent,
  "key" | "keyChar" | "isHeld" | "modifiers" | "defaultPrevented"
>
export type CommandHandler = (event: CommandInput) => CommandResult
export interface CommandDefinition {
  readonly id: CommandId
  readonly titleKey: `commands.${CommandId}`
  readonly execute: CommandHandler
}

export function createCommandRegistry(handlers: Readonly<Record<CommandId, CommandHandler>>) {
  const commands: readonly CommandDefinition[] = COMMAND_IDS.map(id => ({
    id,
    titleKey: `commands.${id}`,
    execute: handlers[id],
  }))
  return {
    commands,
    execute(id: CommandId, event: CommandInput): CommandResult {
      return handlers[id](event)
    },
  }
}
