import type { KeyEvent } from "@gpuix/react"

const printableCharacter = /^[^\p{C}]$/u

export function stopTextShortcutPropagation(event: KeyEvent) {
  if (event.modifiers?.cmd || event.modifiers?.ctrl) return
  if (
    event.key === "space" ||
    printableCharacter.test(event.key ?? "") ||
    printableCharacter.test(event.keyChar ?? "")
  ) {
    event.stopPropagation()
  }
}
