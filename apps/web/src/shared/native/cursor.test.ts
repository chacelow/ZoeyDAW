// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { LogicalPosition } from "@tauri-apps/api/dpi"
import { acquireCursorLock, moveWindowCursor } from "./cursor"
import type { CursorLock } from "./cursor"

const native = vi.hoisted(() => ({ setCursorPosition: vi.fn(), invoke: vi.fn() }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }))
let lease: CursorLock | null = null
afterEach(async () => {
  const current = lease
  lease = null
  current?.release()
  if (current) await vi.waitFor(() => expect(current.phase).toBe("released"))
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  native.setCursorPosition.mockClear()
  native.invoke.mockReset()
  Reflect.deleteProperty(document, "pointerLockElement")
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__")
  Reflect.deleteProperty(document, "exitPointerLock")
})

it("restores a frame-local drag origin in top-level native window coordinates", () => {
  const top = {}
  const frame = {
    clientLeft: 1,
    clientTop: 1,
    clientWidth: 198,
    clientHeight: 98,
    getBoundingClientRect: () => ({ left: 80, top: 120, width: 400, height: 200 }),
  }
  const owner = { __TAURI_INTERNALS__: {}, parent: top, frameElement: frame }
  Object.defineProperty(top, "parent", { value: top })
  vi.stubGlobal("window", owner)
  moveWindowCursor(20, 30)
  expect(native.setCursorPosition).toHaveBeenCalledWith(new LogicalPosition(122, 182))
})

it("keeps top-level cursor coordinates unchanged", () => {
  const owner = { __TAURI_INTERNALS__: {} }
  Object.defineProperty(owner, "parent", { value: owner })
  vi.stubGlobal("window", owner)
  moveWindowCursor(20, 30)
  expect(native.setCursorPosition).toHaveBeenCalledWith(new LogicalPosition(20, 30))
})

function nativeWindow() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} })
  return () => Reflect.deleteProperty(window, "__TAURI_INTERNALS__")
}

it("serializes an early release after native acquisition and refuses another owner until restored", async () => {
  const clear = nativeWindow()
  let acknowledge!: () => void
  const acquisition = new Promise<void>(resolve => {
    acknowledge = resolve
  })
  native.invoke.mockImplementation((command: string) =>
    command === "cursor_lock_acquire" ? acquisition : Promise.resolve()
  )
  const end = vi.fn()
  lease = acquireCursorLock(document.createElement("div"), 20, 30, end)
  expect(lease?.phase).toBe("acquiring")
  expect(lease?.relative).toBe(true)
  expect(native.invoke).toHaveBeenCalledWith("cursor_lock_acquire", {
    token: expect.any(String),
    x: 20,
    y: 30,
  })
  lease?.release()
  expect(lease?.phase).toBe("releasing")
  expect(acquireCursorLock(document.createElement("div"), 1, 1, end)).toBeNull()
  expect(native.invoke).toHaveBeenCalledTimes(1)
  acknowledge()
  await vi.waitFor(() => expect(lease?.phase).toBe("released"))
  expect(native.invoke).toHaveBeenLastCalledWith("cursor_lock_release", {
    token: native.invoke.mock.calls[0]?.[1].token,
    x: 20,
    y: 30,
  })
  expect(lease?.phase).toBe("released")
  const old = lease
  lease = acquireCursorLock(document.createElement("div"), 1, 1, end)
  const calls = native.invoke.mock.calls.length
  old?.release()
  expect(native.invoke).toHaveBeenCalledTimes(calls)
  clear()
})

it.each(["blur", "Escape", "pagehide"])("restores the owning native cursor on %s", async event => {
  const clear = nativeWindow()
  native.invoke.mockResolvedValue(undefined)
  const end = vi.fn()
  lease = acquireCursorLock(document.createElement("div"), 20, 30, end)
  await Promise.resolve()
  expect(lease?.phase).toBe("locked")
  if (event === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: event }))
  else window.dispatchEvent(new Event(event))
  await vi.waitFor(() => expect(lease?.phase).toBe("released"))
  expect(native.invoke).toHaveBeenLastCalledWith("cursor_lock_release", {
    token: native.invoke.mock.calls[0]?.[1].token,
    x: 20,
    y: 30,
  })
  expect(end).toHaveBeenCalledTimes(1)
  expect(lease?.phase).toBe("released")
  clear()
})

it("does not retain ownership after a rejected native grab", async () => {
  const clear = nativeWindow()
  native.invoke.mockRejectedValue(new Error("Window no longer focused"))
  const end = vi.fn()
  lease = acquireCursorLock(document.createElement("div"), 20, 30, end)
  await vi.waitFor(() => expect(lease?.phase).toBe("released"))
  expect(end).toHaveBeenCalledOnce()
  expect(native.invoke).toHaveBeenCalledTimes(1)
  clear()
})

it("releases a browser lock acknowledged after pointer release instead of retaining it", () => {
  const element = document.createElement("div")
  const request = vi.fn()
  const exit = vi.fn(() => {
    Object.defineProperty(document, "pointerLockElement", { configurable: true, value: null })
    document.dispatchEvent(new Event("pointerlockchange"))
  })
  Object.defineProperty(element, "requestPointerLock", { configurable: true, value: request })
  Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit })
  lease = acquireCursorLock(element, 20, 30, vi.fn())
  expect(request).toHaveBeenCalledOnce()
  lease?.release()
  expect(lease?.phase).toBe("releasing")
  document.dispatchEvent(new Event("pointerlockchange"))
  expect(lease?.phase).toBe("releasing")
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: element })
  document.dispatchEvent(new Event("pointerlockchange"))
  expect(exit).toHaveBeenCalledOnce()
  expect(lease?.phase).toBe("released")
  Reflect.deleteProperty(document, "exitPointerLock")
})

it("uses browser lock ownership and leaves somebody else's lock untouched", () => {
  const other = document.createElement("div")
  const element = document.createElement("div")
  const exit = vi.fn()
  Object.defineProperty(document, "exitPointerLock", { configurable: true, value: exit })
  Object.defineProperty(element, "requestPointerLock", { configurable: true, value: vi.fn() })
  lease = acquireCursorLock(element, 20, 30, vi.fn())
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: element })
  document.dispatchEvent(new Event("pointerlockchange"))
  expect(lease?.relative).toBe(true)
  expect(lease?.phase).toBe("locked")
  Object.defineProperty(document, "pointerLockElement", { configurable: true, value: other })
  document.dispatchEvent(new Event("pointerlockchange"))
  lease?.release()
  expect(exit).not.toHaveBeenCalled()
  expect(acquireCursorLock(element, 20, 30, vi.fn())).toBeNull()
  Reflect.deleteProperty(document, "exitPointerLock")
})

it("hides immediately and restores the release-time frame anchor even before the native lock ACK", async () => {
  nativeWindow()
  let acknowledge!: () => void
  const acquisition = new Promise<void>(resolve => {
    acknowledge = resolve
  })
  native.invoke.mockImplementation((command: string) =>
    command === "cursor_lock_acquire" ? acquisition : Promise.resolve()
  )
  let destination = { x: 80, y: 30 }
  lease = acquireCursorLock(document.createElement("div"), 80, 30, vi.fn(), () => destination)
  expect(document.documentElement.hasAttribute("data-minimap-cursor-lock")).toBe(true)
  destination = { x: 145, y: 45 }
  lease?.release()
  expect(document.documentElement.hasAttribute("data-minimap-cursor-lock")).toBe(true)
  destination = { x: 900, y: 900 }
  acknowledge()
  await vi.waitFor(() => expect(lease?.phase).toBe("released"))
  expect(native.invoke).toHaveBeenLastCalledWith("cursor_lock_release", {
    token: native.invoke.mock.calls[0]?.[1].token,
    x: 145,
    y: 45,
  })
  expect(document.documentElement.hasAttribute("data-minimap-cursor-lock")).toBe(false)
})
