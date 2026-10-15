import { describe, expect, test } from "bun:test"
import { createWindowCloseGuard } from "./close-guard"
import type { CloseGuardRenderer, WindowCloseGuard } from "./close-guard"

/** Mirrors the patched renderer: the close button asks the handler, `closeWindow` does not. */
function closableRenderer() {
  let handler: (() => boolean) | null = null
  const state = { open: true, queries: 0 }
  const renderer: CloseGuardRenderer = {
    setWindowShouldClose(callback) {
      handler = callback
    },
    closeWindow() {
      state.open = false
    },
  }
  return {
    renderer,
    state,
    pressCloseButton() {
      state.queries++
      if (handler?.() ?? true) state.open = false
    },
  }
}

describe("window close guard", () => {
  test("a dirty project vetoes the close button while close() still closes", () => {
    const host = closableRenderer()
    let dirty = true
    const guard = createWindowCloseGuard(host.renderer, { shouldClose: () => !dirty })
    expect(guard.supported).toBe(true)

    host.pressCloseButton()
    expect(host.state).toEqual({ open: true, queries: 1 })
    guard.close()
    expect(host.state).toEqual({ open: false, queries: 1 })

    const clean = closableRenderer()
    createWindowCloseGuard(clean.renderer, { shouldClose: () => !dirty })
    dirty = false
    clean.pressCloseButton()
    expect(clean.state.open).toBe(false)
  })

  test("the dialog decides asynchronously and closing inside the native query is rejected", async () => {
    const host = closableRenderer()
    let guard: WindowCloseGuard | null = null
    let decision: Promise<void> | null = null
    let reentrant: unknown = null
    guard = createWindowCloseGuard(host.renderer, {
      shouldClose() {
        try {
          guard?.close()
        } catch (error) {
          reentrant = error
        }
        decision = Promise.resolve().then(() => guard?.close())
        return false
      },
    })

    host.pressCloseButton()
    expect(reentrant).toBeInstanceOf(Error)
    expect(host.state.open).toBe(true)
    await decision
    expect(host.state.open).toBe(false)
  })

  test("renderers without close support report it instead of silently ignoring close()", () => {
    const guard = createWindowCloseGuard({}, { shouldClose: () => false })
    expect(guard.supported).toBe(false)
    expect(() => guard.close()).toThrow(Error)
  })
})
