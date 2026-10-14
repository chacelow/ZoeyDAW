import { describe, expect, test } from "bun:test"
import { createApplicationActiveSubscription } from "./application-active"

function createHarness(initial: boolean | null = true) {
  let activity = initial
  let reads = 0
  let starts = 0
  let stops = 0
  let interval: number | undefined
  let tick: (() => void) | undefined
  const subscribe = createApplicationActiveSubscription({
    readActive: () => {
      reads += 1
      return activity
    },
    startSampling: (sample, intervalMs) => {
      starts += 1
      interval = intervalMs
      tick = sample
      return () => {
        stops += 1
        tick = undefined
      }
    },
  })
  return {
    subscribe,
    advance: (next: boolean | null) => {
      activity = next
      tick?.()
    },
    stats: () => ({ reads, starts, stops, interval, running: tick !== undefined }),
  }
}

describe("application activation sampling", () => {
  test("starts lazily and stops after the final lease, with idempotent cleanup", () => {
    const harness = createHarness()
    const changes: boolean[] = []
    expect(harness.stats()).toMatchObject({ reads: 0, starts: 0, running: false })
    const unsubscribe = harness.subscribe(active => {
      changes.push(active)
    })
    expect(harness.stats()).toMatchObject({ reads: 1, starts: 1, interval: 50, running: true })
    expect(changes).toEqual([])
    unsubscribe()
    unsubscribe()
    harness.advance(false)
    expect(harness.stats()).toMatchObject({ reads: 1, stops: 1, running: false })
    expect(changes).toEqual([])
  })

  test("notifies only activity transitions", () => {
    const harness = createHarness()
    const changes: boolean[] = []
    const unsubscribe = harness.subscribe(active => {
      changes.push(active)
    })
    harness.advance(true)
    harness.advance(false)
    harness.advance(false)
    harness.advance(true)
    harness.advance(true)
    expect(changes).toEqual([false, true])
    unsubscribe()
  })

  test("unknown activity is active, including transitions out of inactivity", () => {
    const harness = createHarness(null)
    const changes: boolean[] = []
    const unsubscribe = harness.subscribe(active => {
      changes.push(active)
    })
    harness.advance(true)
    harness.advance(null)
    harness.advance(false)
    harness.advance(null)
    harness.advance(true)
    expect(changes).toEqual([false, true])
    unsubscribe()
  })

  test("all subscribers share one sampler and release independently", () => {
    const harness = createHarness()
    const first: boolean[] = []
    const second: boolean[] = []
    const unsubscribeFirst = harness.subscribe(active => {
      first.push(active)
    })
    const unsubscribeSecond = harness.subscribe(active => {
      second.push(active)
    })
    expect(harness.stats()).toMatchObject({ starts: 1, reads: 1 })
    harness.advance(false)
    unsubscribeFirst()
    harness.advance(true)
    expect(first).toEqual([false])
    expect(second).toEqual([false, true])
    expect(harness.stats()).toMatchObject({ starts: 1, stops: 0, reads: 3 })
    unsubscribeSecond()
    expect(harness.stats()).toMatchObject({ stops: 1, running: false })
  })

  test("duplicate callbacks have independent subscriptions", () => {
    const harness = createHarness()
    const changes: boolean[] = []
    const listener = (active: boolean) => {
      changes.push(active)
    }
    const first = harness.subscribe(listener)
    const second = harness.subscribe(listener)
    harness.advance(false)
    first()
    harness.advance(true)
    expect(changes).toEqual([false, false, true])
    expect(harness.stats()).toMatchObject({ starts: 1, stops: 0 })
    second()
    expect(harness.stats()).toMatchObject({ stops: 1 })
  })

  test("restarting captures a fresh baseline without replaying unobserved changes", () => {
    const harness = createHarness()
    const changes: boolean[] = []
    harness.subscribe(active => {
      changes.push(active)
    })()
    harness.advance(false)
    const unsubscribe = harness.subscribe(active => {
      changes.push(active)
    })
    harness.advance(false)
    expect(changes).toEqual([])
    harness.advance(true)
    expect(changes).toEqual([true])
    expect(harness.stats()).toMatchObject({ starts: 2, stops: 1 })
    unsubscribe()
  })
})
