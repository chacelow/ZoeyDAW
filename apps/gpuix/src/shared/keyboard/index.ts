export type CommandResult = "handled" | "pass"

export interface ConsumableKeyEvent {
  preventDefault(): void
  stopPropagation(): void
}

/** Text input isolation is not a command: it must preserve the native default. */
export function consumeKey(event: ConsumableKeyEvent, result: CommandResult): CommandResult {
  if (result === "handled") {
    event.preventDefault()
    event.stopPropagation()
  }
  return result
}
