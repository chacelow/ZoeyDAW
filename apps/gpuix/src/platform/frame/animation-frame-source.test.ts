import { describe, expect, test } from "bun:test"
import { createAnimationFrameSource, createFrameScheduler } from "./animation-frame-source"
import type { AnimationFrameCallback, FrameRenderer } from "./animation-frame-source"

function frameRenderer() {
  let callback: AnimationFrameCallback | null = null
  let resumeCallback: AnimationFrameCallback | null = null
  let active = false
  const calls: string[] = []
  const renderer: FrameRenderer = {
    setAnimationFrameCallback(next) {
      calls.push(next === null ? "callback:null" : "callback:set")
      callback = next
    },
    setResumeFrameCallback(next) {
      calls.push(next === null ? "resume:null" : "resume:set")
      resumeCallback = next
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
    get resumeCallback() {
      return resumeCallback
    },
    registeredCallback() {
      if (callback === null) throw new Error("No registered native frame callback")
      return callback
    },
    registeredResumeCallback() {
      if (resumeCallback === null) throw new Error("No registered native resume callback")
      return resumeCallback
    },
    frame(timestampMs: number) {
      callback?.(timestampMs)
    },
    resume(timestampMs: number) {
      resumeCallback?.(timestampMs)
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
  test("renderer without resume support fails before registering ordinary frames", () => {
    const host = frameRenderer()
    expect(() =>
      createAnimationFrameSource({
        setAnimationFrameCallback: host.renderer.setAnimationFrameCallback,
        setAnimationFrameActive: host.renderer.setAnimationFrameActive,
      })
    ).toThrow("Renderer does not support animation frame callbacks")
    expect(host.calls).toEqual([])
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

describe("resume frame source", () => {
  test("resume demand is independent of ordinary frame sessions", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: string[] = []
    const stopResume = source.subscribeResume(timestamp => {
      delivered.push(`resume:${timestamp}`)
    })
    expect(host.calls).toEqual(["resume:set"])
    expect(host.active).toBe(false)
    expect(host.callback).toBeNull()
    const stopFrame = source.subscribe(timestamp => {
      delivered.push(`ordinary:${timestamp}`)
    })
    host.frame(1)
    host.resume(2)
    expect(delivered).toEqual(["resume:2"])
    await drainFrame()
    expect(delivered).toEqual(["resume:2", "ordinary:1"])
    stopFrame()
    expect(host.resumeCallback).not.toBeNull()
    host.resume(3)
    expect(delivered).toEqual(["resume:2", "ordinary:1", "resume:3"])
    stopResume()
    expect(host.calls).toEqual([
      "resume:set",
      "callback:set",
      "active:true",
      "active:false",
      "callback:null",
      "resume:null",
    ])
  })

  test("removing the final resume listener leaves an ordinary frame session running", async () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: string[] = []
    const stopFrame = source.subscribe(timestamp => {
      delivered.push(`ordinary:${timestamp}`)
    })
    const ordinaryCallback = host.registeredCallback()
    const stopResume = source.subscribeResume(timestamp => {
      delivered.push(`resume:${timestamp}`)
    })
    stopResume()
    expect(host.resumeCallback).toBeNull()
    expect(host.callback).toBe(ordinaryCallback)
    expect(host.active).toBe(true)
    host.frame(4)
    await drainFrame()
    expect(delivered).toEqual(["ordinary:4"])
    stopFrame()
    expect(host.calls).toEqual([
      "callback:set",
      "active:true",
      "resume:set",
      "resume:null",
      "active:false",
      "callback:null",
    ])
  })

  test("shared native resume callback dispatches synchronously and cancels each subscription", () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: number[] = []
    const callback = (timestamp: number) => {
      delivered.push(timestamp)
    }
    const stopFirst = source.subscribeResume(callback)
    const nativeCallback = host.registeredResumeCallback()
    const stopSecond = source.subscribeResume(callback)
    expect(host.calls).toEqual(["resume:set"])
    expect(host.resumeCallback).toBe(nativeCallback)
    host.resume(4)
    expect(delivered).toEqual([4, 4])
    stopFirst()
    stopFirst()
    host.resume(5)
    expect(delivered).toEqual([4, 4, 5])
    stopSecond()
    stopSecond()
    expect(host.calls).toEqual(["resume:set", "resume:null"])
    nativeCallback(6)
    expect(delivered).toEqual([4, 4, 5])
  })

  test("cancellation during resume dispatch and old native callback cannot reach later listeners", () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: string[] = []
    let stopSecond: () => void = () => undefined
    const stopFirst = source.subscribeResume(() => {
      delivered.push("first")
      stopSecond()
    })
    const oldNativeCallback = host.registeredResumeCallback()
    stopSecond = source.subscribeResume(() => {
      delivered.push("second")
    })
    host.resume(1)
    expect(delivered).toEqual(["first"])
    stopFirst()
    const stopNext = source.subscribeResume(() => {
      delivered.push("next")
    })
    expect(host.registeredResumeCallback()).not.toBe(oldNativeCallback)
    oldNativeCallback(2)
    expect(delivered).toEqual(["first"])
    host.resume(3)
    expect(delivered).toEqual(["first", "next"])
    stopNext()
    expect(host.active).toBe(false)
  })

  test("listener added during resume starts with the next transition", () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: string[] = []
    let stopNew: () => void = () => undefined
    const stopFirst = source.subscribeResume(() => {
      delivered.push("first")
      stopNew = source.subscribeResume(() => {
        delivered.push("new")
      })
    })
    host.resume(1)
    expect(delivered).toEqual(["first"])
    stopFirst()
    host.resume(2)
    expect(delivered).toEqual(["first", "new"])
    stopNew()
    expect(host.resumeCallback).toBeNull()
  })

  test("last listener can cancel itself inside the native resume callback", () => {
    const host = frameRenderer()
    const source = createAnimationFrameSource(host.renderer)
    const delivered: number[] = []
    let stop: () => void = () => undefined
    stop = source.subscribeResume(timestamp => {
      delivered.push(timestamp)
      stop()
    })
    const nativeCallback = host.registeredResumeCallback()
    host.resume(9)
    expect(delivered).toEqual([9])
    expect(host.resumeCallback).toBeNull()
    expect(host.calls).toEqual(["resume:set", "resume:null"])
    nativeCallback(10)
    expect(delivered).toEqual([9])
  })
})

test("the shared frame scheduler unsubscribes after one frame and cancelled jobs never run", async () => {
  const host = frameRenderer()
  const schedule = createFrameScheduler(createAnimationFrameSource(host.renderer))
  let calls = 0
  const cancel = schedule(() => calls++)
  host.frame(1)
  await drainFrame()
  expect(calls).toBe(1)
  expect(host.active).toBe(false)
  cancel()
  const cancelled = schedule(() => calls++)
  host.frame(2)
  cancelled()
  await drainFrame()
  expect(calls).toBe(1)
  expect(host.active).toBe(false)
})
