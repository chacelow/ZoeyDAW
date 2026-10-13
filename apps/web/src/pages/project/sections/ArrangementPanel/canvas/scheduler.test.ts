// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScheduler } from "./scheduler"

describe("rAF scheduler", () => {
  let callbacks: Array<(now: number) => void>
  let now: number

  beforeEach(() => {
    callbacks = []
    now = 0
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      callbacks.push(cb)
      return callbacks.length
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      callbacks[id - 1] = () => {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flush(nextNow = now + 16) {
    now = nextNow
    const pending = callbacks.splice(0)
    for (const cb of pending) cb(now)
  }

  it("paints a registered painter on the next frame and leaves it clean", () => {
    const s = createScheduler()
    const paint = vi.fn()
    s.register("a", paint)
    expect(paint).not.toHaveBeenCalled()
    flush()
    expect(paint).toHaveBeenCalledTimes(1)
    flush()
    expect(paint).toHaveBeenCalledTimes(1)
  })

  it("coalesces several invalidations in one frame to a single paint call", () => {
    const s = createScheduler()
    const paint = vi.fn()
    s.register("a", paint)
    flush()
    s.invalidate("a")
    s.invalidate("a")
    s.invalidate("a")
    flush()
    expect(paint).toHaveBeenCalledTimes(2)
  })

  it("repaints next frame when a painter dirties itself from inside paint", () => {
    const s = createScheduler()
    let left = 2
    const paint = vi.fn(() => {
      if (--left > 0) s.invalidate("a")
    })
    s.register("a", paint)
    flush()
    expect(paint).toHaveBeenCalledTimes(1)
    flush()
    expect(paint).toHaveBeenCalledTimes(2)
    flush()
    expect(paint).toHaveBeenCalledTimes(2)
  })

  it("invalidateAll marks every painter dirty for the next frame", () => {
    const s = createScheduler()
    const a = vi.fn()
    const b = vi.fn()
    s.register("a", a)
    s.register("b", b)
    flush()
    s.invalidateAll()
    flush()
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it("stops painting after dispose", () => {
    const s = createScheduler()
    const paint = vi.fn()
    s.register("a", paint)
    s.dispose()
    flush()
    expect(paint).not.toHaveBeenCalled()
  })

  it("unregister removes a painter without disturbing others", () => {
    const s = createScheduler()
    const a = vi.fn()
    const b = vi.fn()
    const detach = s.register("a", a)
    s.register("b", b)
    flush()
    detach()
    s.invalidateAll()
    flush()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })
})
