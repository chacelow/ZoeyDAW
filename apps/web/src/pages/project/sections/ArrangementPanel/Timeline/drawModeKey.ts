import { useEffect } from "react"
import { projectActions, useProjectState } from "@/pages/project/adapters"

let held: { original: boolean; used: boolean } | null = null

export function drawModeKeyDown(event: KeyboardEvent): boolean {
  if (
    event.key.toLowerCase() !== "b" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    useProjectState.getState().workspace.computerKeyboard
  ) {
    return false
  }
  if (held || event.repeat) {
    return true
  }
  const original = useProjectState.getState().workspace.drawMode
  held = { original, used: false }
  projectActions.setDrawModeOverride(!original)
  return true
}

export function markDrawModeGesture(): void {
  if (held) {
    held.used = true
  }
}

export function cancelDrawModeKey(): void {
  held = null
  projectActions.setDrawModeOverride(null)
}

export function setDrawModeLatched(enabled: boolean): void {
  cancelDrawModeKey()
  projectActions.setMode("drawMode", enabled)
}

function releaseDrawModeKey(): void {
  const previous = held
  held = null
  if (!previous) {
    return
  }
  if (!previous.used) {
    projectActions.setMode("drawMode", !previous.original)
  }
  projectActions.setDrawModeOverride(null)
}

export function useDrawModeKeyRelease(): void {
  useEffect(() => {
    const up = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "b") {
        releaseDrawModeKey()
      }
    }
    window.addEventListener("keyup", up)
    window.addEventListener("blur", cancelDrawModeKey)
    return () => {
      cancelDrawModeKey()
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", cancelDrawModeKey)
    }
  }, [])
}
