import { invoke } from "@tauri-apps/api/core"
import { LogicalPosition } from "@tauri-apps/api/dpi"
import { getCurrentWindow } from "@tauri-apps/api/window"

export function hasNativeCursor(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function windowCursorPosition(clientX: number, clientY: number): LogicalPosition {
  let owner: Window = window
  let x = clientX
  let y = clientY
  while (owner !== owner.parent) {
    const frame = owner.frameElement
    if (!frame) break
    const bounds = frame.getBoundingClientRect()
    const width = frame.clientWidth + frame.clientLeft * 2
    const height = frame.clientHeight + frame.clientTop * 2
    const scaleX = width ? bounds.width / width : 1
    const scaleY = height ? bounds.height / height : 1
    x = bounds.left + (frame.clientLeft + x) * scaleX
    y = bounds.top + (frame.clientTop + y) * scaleY
    owner = owner.parent
  }
  return new LogicalPosition(x, y)
}

export function moveWindowCursor(clientX: number, clientY: number): void | Promise<void> {
  if (!hasNativeCursor()) return
  return getCurrentWindow().setCursorPosition(windowCursorPosition(clientX, clientY))
}

export type CursorLock = {
  readonly phase: "acquiring" | "locked" | "releasing" | "released"
  readonly relative: boolean
  recenter(x: number, y: number): Promise<void>
  release(): void
}

const cursorState: { ownerToken: string | null; nextOwner: number } = {
  ownerToken: null,
  nextOwner: 0,
}

function browserPointerLockElement(): Element | null {
  const locked: unknown = Reflect.get(document, "pointerLockElement")
  return locked instanceof Element ? locked : null
}

export function acquireCursorLock(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  onEnd: () => void,
  restorePosition?: () => { x: number; y: number }
): CursorLock | null {
  if (cursorState.ownerToken || browserPointerLockElement()) return null
  const native = hasNativeCursor()
  if (!native && !element.requestPointerLock) return null
  const token = `${Date.now()}-${++cursorState.nextOwner}`
  const origin = windowCursorPosition(clientX, clientY)
  let destination = origin
  let phase: CursorLock["phase"] = "acquiring"
  let acknowledged = false
  let browserRequestPending = !native
  let nativeStart: Promise<unknown>
  let recentering = Promise.resolve()

  const removeListeners = () => {
    window.removeEventListener("blur", end)
    window.removeEventListener("pagehide", end)
    window.removeEventListener("keydown", key)
    document.removeEventListener("pointerlockchange", changed)
    document.removeEventListener("pointerlockerror", failed)
  }
  const finish = () => {
    phase = "released"
    removeListeners()
    if (cursorState.ownerToken === token) cursorState.ownerToken = null
    if (document.documentElement.getAttribute("data-minimap-cursor-lock") === token)
      document.documentElement.removeAttribute("data-minimap-cursor-lock")
  }
  const releaseNative = () => {
    void nativeStart
      .then(() => recentering.catch(() => {}))
      .then(() => invoke("cursor_lock_release", { token, x: destination.x, y: destination.y }))
      .then(finish)
      .catch(finish)
  }
  const lease: CursorLock = {
    get phase() {
      return phase
    },
    get relative() {
      return (
        (phase === "acquiring" || phase === "locked") &&
        (native || browserPointerLockElement() === element)
      )
    },
    recenter(x, y) {
      if (!native || phase !== "locked") return Promise.resolve()
      recentering = recentering.catch(() => {}).then(() => moveWindowCursor(x, y))
      return recentering
    },
    release() {
      if (phase === "releasing" || phase === "released") return
      if (restorePosition) {
        const point = restorePosition()
        if (Number.isFinite(point.x) && Number.isFinite(point.y))
          destination = windowCursorPosition(point.x, point.y)
      }
      phase = "releasing"
      if (native) {
        releaseNative()
      } else if (browserPointerLockElement() === element) {
        document.exitPointerLock()
      } else if (!browserRequestPending) {
        finish()
      }
    },
  }
  function end() {
    lease.release()
    onEnd()
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") end()
  }
  function changed() {
    if (browserPointerLockElement() === element) {
      browserRequestPending = false
      acknowledged = true
      if (phase === "releasing") document.exitPointerLock()
      else phase = "locked"
    } else if (acknowledged) {
      finish()
      onEnd()
    }
  }
  function failed() {
    browserRequestPending = false
    finish()
    onEnd()
  }
  cursorState.ownerToken = token
  document.documentElement.setAttribute("data-minimap-cursor-lock", token)
  window.addEventListener("blur", end)
  window.addEventListener("pagehide", end)
  window.addEventListener("keydown", key)
  if (native) {
    nativeStart = invoke("cursor_lock_acquire", { token, x: origin.x, y: origin.y })
    void nativeStart
      .then(() => {
        if (phase === "acquiring") phase = "locked"
      })
      .catch(() => {
        if (phase !== "releasing") {
          finish()
          onEnd()
        }
      })
  } else {
    document.addEventListener("pointerlockchange", changed)
    document.addEventListener("pointerlockerror", failed)
    try {
      const request = element.requestPointerLock()
      if (request) void request.catch(failed)
    } catch {
      failed()
    }
  }
  return lease
}
