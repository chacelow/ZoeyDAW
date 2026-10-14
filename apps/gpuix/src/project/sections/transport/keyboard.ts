import type { KeyEvent } from "@gpuix/react"
import { projectActions } from "../../adapters"

export function handleTransportKeyDown(event: KeyEvent): boolean {
  const modifiers = event.modifiers
  if (
    event.key !== "space" ||
    event.defaultPrevented ||
    modifiers?.cmd ||
    modifiers?.ctrl ||
    modifiers?.alt ||
    modifiers?.shift
  )
    return false
  event.preventDefault()
  if (!event.isHeld) projectActions.togglePlay()
  return true
}
