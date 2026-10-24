// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { LogicalPosition } from "@tauri-apps/api/dpi"
import { moveWindowCursor } from "./cursor"

const native = vi.hoisted(() => ({ setCursorPosition: vi.fn() }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }))
afterEach(() => {
  vi.unstubAllGlobals()
  native.setCursorPosition.mockClear()
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
