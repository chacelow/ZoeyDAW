import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Component } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { AnimationFrameProvider, useAnimationFrame } from "./index"
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
  const counts = { subscriptions: 0, cancellations: 0 }
  const source: AnimationFrameSource = {
    subscribe(callback) {
      counts.subscriptions++
      listeners.add(callback)
      return () => {
        if (listeners.delete(callback)) counts.cancellations++
      }
    },
  }
  return {
    source,
    counts,
    get listenerCount() {
      return listeners.size
    },
    emit(timestampMs: number) {
      for (const callback of [...listeners]) callback(timestampMs)
    },
    queue(timestampMs: number) {
      const pending = [...listeners]
      // Retain the callbacks to exercise the hook's own cancellation guard.
      queueMicrotask(() => {
        for (const callback of pending) callback(timestampMs)
      })
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
