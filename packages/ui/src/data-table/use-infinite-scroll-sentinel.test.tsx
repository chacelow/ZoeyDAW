// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useInfiniteScrollSentinel } from "./use-infinite-scroll-sentinel"

type Intersection = Pick<IntersectionObserverEntry, "target" | "isIntersecting">

const observers: TestIntersectionObserver[] = []

class TestIntersectionObserver {
  readonly targets = new Set<Element>()
  readonly observe = vi.fn((target: Element) => this.targets.add(target))
  readonly disconnect = vi.fn(() => this.targets.clear())
  private readonly callback: (entries: Intersection[]) => void
  readonly options: IntersectionObserverInit

  constructor(callback: (entries: Intersection[]) => void, options: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    observers.push(this)
  }

  emit(target: Element) {
    this.callback([{ target, isIntersecting: true }])
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function Sentinel({
  version = 0,
  rootVersion = 0,
  onReachEnd,
}: {
  version?: number
  rootVersion?: number
  onReachEnd: () => void
}) {
  const { rootRef, sentinelRef } = useInfiniteScrollSentinel({ onReachEnd })
  return (
    <div key={rootVersion} ref={rootRef} data-root>
      <div key={version} ref={sentinelRef} data-sentinel />
    </div>
  )
}

function currentObserver() {
  const observer = observers.at(-1)
  if (!observer) {
    throw new Error("Expected a mounted sentinel observer")
  }
  return observer
}

function sentinelElement() {
  const sentinel = host.querySelector("[data-sentinel]")
  if (!sentinel) {
    throw new Error("Expected a mounted sentinel element")
  }
  return sentinel
}

it("disconnects replaced targets and ignores their already queued intersections", () => {
  const onReachEnd = vi.fn()
  act(() => root.render(<Sentinel onReachEnd={onReachEnd} />))
  const previous = currentObserver()
  const oldSentinel = sentinelElement()

  act(() => root.render(<Sentinel version={1} onReachEnd={onReachEnd} />))
  const current = currentObserver()
  const newSentinel = sentinelElement()

  expect(previous.disconnect).toHaveBeenCalledOnce()
  expect(previous.targets.size).toBe(0)
  expect(current.targets).toEqual(new Set([newSentinel]))
  previous.emit(oldSentinel)
  current.emit(oldSentinel)
  expect(onReachEnd).not.toHaveBeenCalled()
  current.emit(newSentinel)
  expect(onReachEnd).toHaveBeenCalledOnce()
})

it("rebinds changed roots, reads the latest handler and retires callbacks on unmount", () => {
  const originalCallback = vi.fn()
  const latestCallback = vi.fn()
  act(() =>
    root.render(
      <StrictMode>
        <Sentinel onReachEnd={originalCallback} />
      </StrictMode>
    )
  )
  const initialObserver = currentObserver()
  const initialSentinel = sentinelElement()

  act(() =>
    root.render(
      <StrictMode>
        <Sentinel onReachEnd={latestCallback} />
      </StrictMode>
    )
  )
  expect(currentObserver()).toBe(initialObserver)
  initialObserver.emit(initialSentinel)
  expect(originalCallback).not.toHaveBeenCalled()
  expect(latestCallback).toHaveBeenCalledOnce()

  act(() =>
    root.render(
      <StrictMode>
        <Sentinel rootVersion={1} onReachEnd={latestCallback} />
      </StrictMode>
    )
  )
  const replacement = currentObserver()
  const replacementSentinel = sentinelElement()
  expect(initialObserver.targets.size).toBe(0)
  expect(replacement.options.root).toBe(host.querySelector("[data-root]"))
  initialObserver.emit(initialSentinel)
  expect(latestCallback).toHaveBeenCalledOnce()
  replacement.emit(replacementSentinel)
  expect(latestCallback).toHaveBeenCalledTimes(2)

  act(() => root.render(null))
  expect(replacement.targets.size).toBe(0)
  replacement.emit(replacementSentinel)
  expect(latestCallback).toHaveBeenCalledTimes(2)
})
