import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Component, useState } from "react"
import type { ReactNode } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import {
  AnimationFrameProvider,
  createAnimationFrameSource,
  useAnimationFrame,
  useResumeFrame,
} from "./index"
import type { AnimationFrameCallback, AnimationFrameSource } from "./index"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

function frameRoot() {
  const root = createTestRoot({ width: 200, height: 100 })
  roots.push(root)
  return root
}

function fakeFrameSource() {
  const listeners = new Set<AnimationFrameCallback>()
  const resumeListeners = new Set<AnimationFrameCallback>()
  const resumeCounts = { subscriptions: 0, cancellations: 0 }
  const counts = { subscriptions: 0, cancellations: 0 }
  const source: AnimationFrameSource = {
    subscribe(callback) {
      counts.subscriptions++
      listeners.add(callback)
      return () => {
        if (listeners.delete(callback)) counts.cancellations++
      }
    },
    subscribeResume(callback) {
      resumeCounts.subscriptions++
      resumeListeners.add(callback)
      return () => {
        if (resumeListeners.delete(callback)) resumeCounts.cancellations++
      }
    },
  }
  return {
    source,
    counts,
    resumeCounts,
    get resumeListenerCount() {
      return resumeListeners.size
    },
    get listenerCount() {
      return listeners.size
    },
    emit(timestampMs: number) {
      for (const callback of [...listeners]) callback(timestampMs)
    },
    queue(timestampMs: number) {
      const pending = [...listeners]
      queueMicrotask(() => {
        for (const callback of pending) callback(timestampMs)
      })
    },
    resume(timestampMs: number) {
      for (const callback of [...resumeListeners]) callback(timestampMs)
    },
    retainedResume(timestampMs: number) {
      return [...resumeListeners].map(callback => () => callback(timestampMs))
    },
  }
}

function Subscriber({
  callback,
  active,
}: {
  readonly callback: AnimationFrameCallback
  readonly active: boolean
}) {
  useAnimationFrame(callback, active)
  return null
}

function ResumeSubscriber({
  callback,
  active,
}: {
  readonly callback: AnimationFrameCallback
  readonly active: boolean
}) {
  useResumeFrame(callback, active)
  return null
}

class FrameErrorBoundary extends Component<
  { readonly children: ReactNode; readonly onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

describe("useAnimationFrame", () => {
  test("active transitions subscribe once, cancel promptly and release on unmount", async () => {
    const fake = fakeFrameSource()
    const root = frameRoot()
    const frames: number[] = []
    const callback = (timestamp: number) => {
      frames.push(timestamp)
    }
    function Harness({ active }: { readonly active: boolean }) {
      return (
        <AnimationFrameProvider source={fake.source}>
          <Subscriber callback={callback} active={active} />
        </AnimationFrameProvider>
      )
    }

    root.render(<Harness active={false} />)
    expect(fake.listenerCount).toBe(0)
    expect(fake.counts.subscriptions).toBe(0)
    fake.emit(1)
    expect(frames).toEqual([])
    root.render(<Harness active />)
    root.render(<Harness active />)
    expect(fake.listenerCount).toBe(1)
    expect(fake.counts.subscriptions).toBe(1)
    fake.emit(2)
    expect(frames).toEqual([2])

    fake.queue(3)
    root.render(<Harness active={false} />)
    expect(fake.listenerCount).toBe(0)
    expect(fake.counts.cancellations).toBe(1)
    fake.emit(4)
    await new Promise<void>(resolve => {
      queueMicrotask(resolve)
    })
    expect(frames).toEqual([2])
    root.render(<Harness active={false} />)
    expect(fake.counts.cancellations).toBe(1)

    root.render(<Harness active />)
    expect(fake.listenerCount).toBe(1)
    expect(fake.counts.subscriptions).toBe(2)
    fake.emit(5)
    expect(frames).toEqual([2, 5])
    root.unmount()
    expect(fake.listenerCount).toBe(0)
    expect(fake.counts.cancellations).toBe(2)
    fake.emit(6)
    expect(frames).toEqual([2, 5])
  })

  test("callback changes use the latest commit without restarting the subscription", () => {
    const fake = fakeFrameSource()
    const root = frameRoot()
    const frames: string[] = []
    const first = (timestamp: number) => {
      frames.push(`first:${timestamp}`)
    }
    const second = (timestamp: number) => {
      frames.push(`second:${timestamp}`)
    }
    root.render(
      <AnimationFrameProvider source={fake.source}>
        <Subscriber callback={first} active />
      </AnimationFrameProvider>
    )
    fake.emit(1)
    root.render(
      <AnimationFrameProvider source={fake.source}>
        <Subscriber callback={second} active />
      </AnimationFrameProvider>
    )
    fake.emit(3)
    expect(frames).toEqual(["first:1", "second:3"])
    expect(fake.counts.subscriptions).toBe(1)
    expect(fake.counts.cancellations).toBe(0)
    root.unmount()
    expect(fake.counts.cancellations).toBe(1)
  })

  test("multiple hooks independently subscribe, deactivate and unmount", () => {
    const fake = fakeFrameSource()
    const root = frameRoot()
    const first: number[] = []
    const second: number[] = []
    const onFirst = (timestamp: number) => {
      first.push(timestamp)
    }
    const onSecond = (timestamp: number) => {
      second.push(timestamp)
    }
    function Harness({
      firstActive,
      secondActive,
    }: {
      readonly firstActive: boolean
      readonly secondActive: boolean
    }) {
      return (
        <AnimationFrameProvider source={fake.source}>
          <Subscriber callback={onFirst} active={firstActive} />
          <Subscriber callback={onSecond} active={secondActive} />
        </AnimationFrameProvider>
      )
    }

    root.render(<Harness firstActive secondActive={false} />)
    fake.emit(1)
    expect(fake.listenerCount).toBe(1)
    root.render(<Harness firstActive secondActive />)
    fake.emit(2)
    expect(fake.listenerCount).toBe(2)
    expect(fake.counts.subscriptions).toBe(2)
    root.render(<Harness firstActive={false} secondActive />)
    fake.emit(3)
    expect(fake.listenerCount).toBe(1)
    expect(fake.counts.cancellations).toBe(1)
    expect(first).toEqual([1, 2])
    expect(second).toEqual([2, 3])
    root.unmount()
    expect(fake.listenerCount).toBe(0)
    expect(fake.counts.cancellations).toBe(2)
    fake.emit(4)
    expect(first).toEqual([1, 2])
    expect(second).toEqual([2, 3])
  })

  test("retained queued callbacks cannot survive deactivation, reactivation or unmount", async () => {
    const fake = fakeFrameSource()
    const root = frameRoot()
    const frames: number[] = []
    const callback = (timestamp: number) => {
      frames.push(timestamp)
    }
    function Harness({ active }: { readonly active: boolean }) {
      return (
        <AnimationFrameProvider source={fake.source}>
          <Subscriber callback={callback} active={active} />
        </AnimationFrameProvider>
      )
    }

    root.render(<Harness active />)
    fake.queue(1)
    root.render(<Harness active={false} />)
    root.render(<Harness active />)
    await new Promise<void>(resolve => {
      queueMicrotask(resolve)
    })
    expect(frames).toEqual([])
    fake.emit(2)
    expect(frames).toEqual([2])
    fake.queue(3)
    root.unmount()
    await new Promise<void>(resolve => {
      queueMicrotask(resolve)
    })
    expect(frames).toEqual([2])
    expect(fake.listenerCount).toBe(0)
    expect(fake.counts).toEqual({ subscriptions: 2, cancellations: 2 })
  })

  test("changing Provider source cancels the old subscription before using the new one", async () => {
    const first = fakeFrameSource()
    const second = fakeFrameSource()
    const root = frameRoot()
    const frames: number[] = []
    const callback = (timestamp: number) => {
      frames.push(timestamp)
    }
    function Harness({ source }: { readonly source: AnimationFrameSource }) {
      return (
        <AnimationFrameProvider source={source}>
          <Subscriber callback={callback} active />
        </AnimationFrameProvider>
      )
    }

    root.render(<Harness source={first.source} />)
    first.queue(1)
    root.render(<Harness source={second.source} />)
    expect(first.listenerCount).toBe(0)
    expect(first.counts.cancellations).toBe(1)
    expect(second.listenerCount).toBe(1)
    second.emit(2)
    await new Promise<void>(resolve => {
      queueMicrotask(resolve)
    })
    expect(frames).toEqual([2])
    root.unmount()
    expect(second.counts.cancellations).toBe(1)
    expect(second.listenerCount).toBe(0)
  })

  test("missing Provider fails clearly, including for an inactive hook", () => {
    const errors: Error[] = []
    const loggedErrors = spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const root = frameRoot()
      root.render(
        <FrameErrorBoundary
          onError={error => {
            errors.push(error)
          }}
        >
          <Subscriber callback={() => undefined} active={false} />
        </FrameErrorBoundary>
      )
      root.unmount()
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(Error)
    } finally {
      loggedErrors.mockRestore()
    }
  })
})

describe("useResumeFrame", () => {
  test("active transitions, callback replacement, source replacement and unmount cancel independently", () => {
    const first = fakeFrameSource()
    const second = fakeFrameSource()
    const root = frameRoot()
    const observed: string[] = []
    const firstCallback = (timestamp: number) => {
      observed.push(`first:${timestamp}`)
    }
    const nextCallback = (timestamp: number) => {
      observed.push(`next:${timestamp}`)
    }
    function Harness({
      source,
      active,
      callback,
    }: {
      readonly source: AnimationFrameSource
      readonly active: boolean
      readonly callback: AnimationFrameCallback
    }) {
      return (
        <AnimationFrameProvider source={source}>
          <ResumeSubscriber active={active} callback={callback} />
        </AnimationFrameProvider>
      )
    }
    root.render(<Harness source={first.source} active={false} callback={firstCallback} />)
    expect(first.resumeListenerCount).toBe(0)
    root.render(<Harness source={first.source} active callback={firstCallback} />)
    first.resume(1)
    root.render(<Harness source={first.source} active callback={nextCallback} />)
    first.resume(2)
    expect(observed).toEqual(["first:1", "next:2"])
    expect(first.resumeCounts.subscriptions).toBe(1)
    const [retained] = first.retainedResume(3)
    root.render(<Harness source={second.source} active callback={nextCallback} />)
    retained?.()
    first.resume(4)
    second.resume(5)
    expect(observed).toEqual(["first:1", "next:2", "next:5"])
    expect(first.resumeCounts.cancellations).toBe(1)
    root.render(<Harness source={second.source} active={false} callback={nextCallback} />)
    second.resume(6)
    expect(second.resumeCounts).toEqual({ subscriptions: 1, cancellations: 1 })
    root.render(<Harness source={second.source} active callback={nextCallback} />)
    second.resume(7)
    root.unmount()
    second.resume(8)
    expect(observed).toEqual(["first:1", "next:2", "next:5", "next:7"])
    expect(second.resumeCounts).toEqual({ subscriptions: 2, cancellations: 2 })
  })

  test("first resume synchronously renders the newest telemetry sequence while ordinary frames remain deferred", async () => {
    const callbacks: {
      ordinary: AnimationFrameCallback | null
      resume: AnimationFrameCallback | null
    } = { ordinary: null, resume: null }
    let insideNative = false
    let telemetry = { sequence: 1 }
    const ordinary: number[] = []
    const renderer = {
      setAnimationFrameCallback(callback: AnimationFrameCallback | null) {
        callbacks.ordinary = callback
      },
      setAnimationFrameActive() {},
      setResumeFrameCallback(callback: AnimationFrameCallback | null) {
        callbacks.resume = callback
      },
      getDebugFrameOverlayStats() {
        if (insideNative) throw new Error("GPUI renderer stats read during native callback")
        return { frames: 1 }
      },
    }
    const source = createAnimationFrameSource(renderer)
    const root = frameRoot()
    function Counter() {
      const [sequence, setSequence] = useState(telemetry.sequence)
      useResumeFrame(() => flushSync(() => setSequence(telemetry.sequence)), true)
      useAnimationFrame(timestamp => {
        renderer.getDebugFrameOverlayStats()
        ordinary.push(timestamp)
      }, true)
      return <text>{`sequence:${sequence}`}</text>
    }
    root.render(
      <AnimationFrameProvider source={source}>
        <Counter />
      </AnimationFrameProvider>
    )
    expect(root.renderer.findByText("sequence:1")).toBeDefined()
    telemetry = { ...telemetry, sequence: 7 }
    insideNative = true
    try {
      callbacks.ordinary?.(42)
      callbacks.resume?.(43)
      expect(ordinary).toEqual([])
    } finally {
      insideNative = false
    }
    expect(root.renderer.findByText("sequence:7")).toBeDefined()
    expect(root.renderer.findByText("sequence:1")).toBeUndefined()
    await new Promise<void>(resolve => {
      queueMicrotask(resolve)
    })
    expect(ordinary).toEqual([42])
    root.unmount()
    expect(callbacks.ordinary).toBeNull()
    expect(callbacks.resume).toBeNull()
  })

  test("without a synchronous React commit the first resumed render still has old telemetry", () => {
    const callbacks: { resume: AnimationFrameCallback | null } = { resume: null }
    let telemetry = { sequence: 1 }
    const source = createAnimationFrameSource({
      setAnimationFrameCallback() {},
      setAnimationFrameActive() {},
      setResumeFrameCallback(callback) {
        callbacks.resume = callback
      },
    })
    const root = frameRoot()
    function Counter() {
      const [sequence, setSequence] = useState(telemetry.sequence)
      useResumeFrame(() => setSequence(telemetry.sequence), true)
      return <text>{`sequence:${sequence}`}</text>
    }
    root.render(
      <AnimationFrameProvider source={source}>
        <Counter />
      </AnimationFrameProvider>
    )
    telemetry = { sequence: 7 }
    callbacks.resume?.(43)
    expect(root.renderer.findByText("sequence:1")).toBeDefined()
    expect(root.renderer.findByText("sequence:7")).toBeUndefined()
    root.unmount()
  })

  test("missing Provider rejects an inactive resume hook", () => {
    const errors: Error[] = []
    const loggedErrors = spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const root = frameRoot()
      root.render(
        <FrameErrorBoundary
          onError={error => {
            errors.push(error)
          }}
        >
          <ResumeSubscriber callback={() => undefined} active={false} />
        </FrameErrorBoundary>
      )
      expect(errors).toHaveLength(1)
      expect(errors[0]?.message).toContain("useResumeFrame")
    } finally {
      loggedErrors.mockRestore()
    }
  })
})
