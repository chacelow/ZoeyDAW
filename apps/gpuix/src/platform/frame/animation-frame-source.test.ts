import { describe, expect, test } from "bun:test"
import { createAnimationFrameSource } from "./animation-frame-source"
import type { AnimationFrameCallback, FrameRenderer } from "./animation-frame-source"

function frameRenderer() {
  let callback: AnimationFrameCallback | null = null
  let active = false
  const calls: string[] = []
  const renderer: FrameRenderer = {
    setAnimationFrameCallback(next) {
      calls.push(next === null ? "callback:null" : "callback:set")
      callback = next
    },
    setAnimationFrameActive(next) {
      calls.push(`active:${next}`)
      active = next
    },
  }
  return {
    renderer,
    calls,
    get active() {
      return active
    },
    get callback() {
      return callback
    },
    registeredCallback() {
      if (callback === null) throw new Error("No registered native frame callback")
      return callback
    },
    frame(timestampMs: number) {
      callback?.(timestampMs)
    },
  }
}

async function drainFrame() {
  await new Promise<void>(resolve => {
    queueMicrotask(resolve)
  })
}

describe("createAnimationFrameSource", () => {
  test("unsupported renderers fail before subscribing", () => {
    expect(() => createAnimationFrameSource({})).toThrow(Error)
  })
  test("construction is side-effect-free and only the first subscriber activates native frames", () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    expect(host.calls).toEqual([])
    expect(host.active).toBe(false)
    expect(host.callback).toBeNull()

    const unsubscribeFirst = source.subscribe(() => undefined)
    const nativeCallback = host.callback
    expect(host.calls).toEqual(["callback:set", "active:true"])
    expect(host.active).toBe(true)
    const unsubscribeSecond = source.subscribe(() => undefined)
    expect(host.calls).toEqual(["callback:set", "active:true"])
    expect(host.callback).toBe(nativeCallback)

    unsubscribeFirst()
    expect(host.active).toBe(true)
    expect(host.calls).toEqual(["callback:set", "active:true"])
    unsubscribeSecond()
    expect(host.active).toBe(false)
    expect(host.callback).toBeNull()
    expect(host.calls).toEqual(["callback:set", "active:true", "active:false", "callback:null"])
    unsubscribeSecond()
    unsubscribeFirst()
    expect(host.calls).toHaveLength(4)
  })

  test("native callbacks defer all listeners until after the GPUI callback returns", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const frames: string[] = []
    const unsubscribeFirst = source.subscribe(timestamp => {
      frames.push(`first:${timestamp}`)
    })
    const unsubscribeSecond = source.subscribe(timestamp => {
      frames.push(`second:${timestamp}`)
    })
    host.frame(12.5)
    host.frame(25)
    expect(frames).toEqual([])
    await drainFrame()
    expect(frames).toEqual(["first:12.5", "second:12.5", "first:25", "second:25"])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  test("each subscription owns its cancellation even when callbacks are identical", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const frames: number[] = []
    const callback = (timestamp: number) => {
      frames.push(timestamp)
    }
    const unsubscribeFirst = source.subscribe(callback)
    const unsubscribeSecond = source.subscribe(callback)
    host.frame(1)
    await drainFrame()
    expect(frames).toEqual([1, 1])
    unsubscribeFirst()
    unsubscribeFirst()
    expect(host.active).toBe(true)
    host.frame(2)
    await drainFrame()
    expect(frames).toEqual([1, 1, 2])
    unsubscribeSecond()
    expect(host.active).toBe(false)
  })

  test("cancellation before the microtask suppresses only the cancelled subscriber", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const first: number[] = []
    const second: number[] = []
    const unsubscribeFirst = source.subscribe(timestamp => {
      first.push(timestamp)
    })
    const unsubscribeSecond = source.subscribe(timestamp => {
      second.push(timestamp)
    })
    host.frame(8)
    unsubscribeFirst()
    await drainFrame()
    expect(first).toEqual([])
    expect(second).toEqual([8])
    unsubscribeSecond()
  })

  test("subscribers added after a native frame do not receive that queued frame", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const first: number[] = []
    const second: number[] = []
    const unsubscribeFirst = source.subscribe(timestamp => {
      first.push(timestamp)
    })
    host.frame(1)
    const unsubscribeSecond = source.subscribe(timestamp => {
      second.push(timestamp)
    })
    await drainFrame()
    expect(first).toEqual([1])
    expect(second).toEqual([])
    host.frame(2)
    await drainFrame()
    expect(first).toEqual([1, 2])
    expect(second).toEqual([2])
    unsubscribeFirst()
    unsubscribeSecond()
  })

  test("inactive sources never deliver already queued or retained native callbacks", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const frames: number[] = []
    const unsubscribe = source.subscribe(timestamp => {
      frames.push(timestamp)
    })
    const nativeCallback = host.registeredCallback()
    nativeCallback(1)
    unsubscribe()
    expect(host.active).toBe(false)
    expect(host.callback).toBeNull()
    nativeCallback(2)
    await drainFrame()
    expect(frames).toEqual([])
  })

  test("reactivation cannot revive old native callbacks or their pending microtasks", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const first: number[] = []
    const second: number[] = []
    const unsubscribeFirst = source.subscribe(timestamp => {
      first.push(timestamp)
    })
    const oldNativeCallback = host.registeredCallback()
    oldNativeCallback(1)
    unsubscribeFirst()
    const unsubscribeSecond = source.subscribe(timestamp => {
      second.push(timestamp)
    })
    expect(host.registeredCallback()).not.toBe(oldNativeCallback)
    oldNativeCallback(2)
    unsubscribeFirst()
    expect(host.active).toBe(true)
    host.frame(3)
    await drainFrame()
    expect(first).toEqual([])
    expect(second).toEqual([3])
    expect(host.calls).toEqual([
      "callback:set",
      "active:true",
      "active:false",
      "callback:null",
      "callback:set",
      "active:true",
    ])
    unsubscribeSecond()
    expect(host.active).toBe(false)
  })

  test("a listener cancelled during delivery cannot run later in that same microtask", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const frames: string[] = []
    let unsubscribeSecond: () => void = () => undefined
    const unsubscribeFirst = source.subscribe(() => {
      frames.push("first")
      unsubscribeSecond()
    })
    unsubscribeSecond = source.subscribe(() => {
      frames.push("second")
    })
    host.frame(1)
    await drainFrame()
    expect(frames).toEqual(["first"])
    unsubscribeFirst()
  })
})
