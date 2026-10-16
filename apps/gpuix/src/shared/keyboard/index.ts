export type CommandResult = "handled" | "pass"

export interface ConsumableKeyEvent {
  preventDefault(): void
  stopPropagation(): void
}

export function consumeKey(event: ConsumableKeyEvent, result: CommandResult): CommandResult {
  if (result === "handled") {
    event.preventDefault()
    event.stopPropagation()
  }
  return result
}
