import { describe, expect, test } from "bun:test"
import { createNativeValueSubscription } from "./native-value-subscription"

function activityRenderer(initial = true) {
  let active = initial
  let callback: ((active: boolean) => void) | null = null
  const resources = { starts: 0, stops: 0 }
  const register = (next: ((active: boolean) => void) | null) => {
    callback = next
    if (next === null) resources.stops++
    else {
      resources.starts++
      next(active)
    }
  }
  return {
    subscribe: createNativeValueSubscription(register, "window activation events"),
    resources,
    emit(next: boolean) {
      active = next
      callback?.(next)
    },
    retainCallback() {
      if (!callback) throw new Error("No activation observer")
      return callback
    },
  }
}

async function drainEvents() {
  await new Promise<void>(resolve => {
    queueMicrotask(resolve)
  })
}

describe("native value subscriptions", () => {
  test("attaches lazily, captures baseline without notifying, and releases the last lease", async () => {
    const host = activityRenderer()
    const changes: boolean[] = []
    expect(host.resources).toEqual({ starts: 0, stops: 0 })
    const unsubscribe = host.subscribe(active => {
      changes.push(active)
    })
    expect(host.resources).toEqual({ starts: 1, stops: 0 })
    await drainEvents()
    expect(changes).toEqual([])
    host.emit(false)
    expect(changes).toEqual([])
    await drainEvents()
    expect(changes).toEqual([false])
    unsubscribe()
    unsubscribe()
    host.emit(true)
    await drainEvents()
    expect(changes).toEqual([false])
    expect(host.resources).toEqual({ starts: 1, stops: 1 })
  })

  test("all listeners share one observer and queued events skip cancelled leases", async () => {
    const host = activityRenderer()
    const first: boolean[] = []
    const second: boolean[] = []
    const cancelFirst = host.subscribe(active => {
      first.push(active)
    })
    const cancelSecond = host.subscribe(active => {
      second.push(active)
    })
    expect(host.resources.starts).toBe(1)
    host.emit(false)
    cancelFirst()
    await drainEvents()
    expect(first).toEqual([])
    expect(second).toEqual([false])
    expect(host.resources.stops).toBe(0)
    host.emit(true)
    await drainEvents()
    expect(second).toEqual([false, true])
    cancelSecond()
    expect(host.resources.stops).toBe(1)
  })

  test("duplicate callbacks retain independent leases", async () => {
    const host = activityRenderer()
    const changes: boolean[] = []
    const listener = (active: boolean) => {
      changes.push(active)
    }
    const first = host.subscribe(listener)
    const second = host.subscribe(listener)
    host.emit(false)
    await drainEvents()
    first()
    host.emit(true)
    await drainEvents()
    expect(changes).toEqual([false, false, true])
    second()
    expect(host.resources).toEqual({ starts: 1, stops: 1 })
  })

  test("restarting captures fresh state and rejects old callbacks and queued transitions", async () => {
    const host = activityRenderer()
    const changes: boolean[] = []
    const first = host.subscribe(active => {
      changes.push(active)
    })
    const oldCallback = host.retainCallback()
    host.emit(false)
    first()
    const second = host.subscribe(active => {
      changes.push(active)
    })
    oldCallback(true)
    await drainEvents()
    expect(changes).toEqual([])
    host.emit(true)
    await drainEvents()
    expect(changes).toEqual([true])
    second()
    expect(host.resources).toEqual({ starts: 2, stops: 2 })
  })

  test("subscriptions added after a transition never receive its queued notification", async () => {
    const host = activityRenderer()
    const first: boolean[] = []
    const second: boolean[] = []
    const cancelFirst = host.subscribe(active => {
      first.push(active)
    })
    host.emit(false)
    const cancelSecond = host.subscribe(active => {
      second.push(active)
    })
    await drainEvents()
    expect(first).toEqual([false])
    expect(second).toEqual([])
    host.emit(true)
    await drainEvents()
    expect(second).toEqual([true])
    cancelFirst()
    cancelSecond()
  })

  test("fixed-seed activation sequences notify exactly the state transitions", async () => {
    const host = activityRenderer()
    const actual: boolean[] = []
    const expected: boolean[] = []
    const unsubscribe = host.subscribe(active => {
      actual.push(active)
    })
    let previous = true
    let seed = 0x146115
    for (let index = 0; index < 500; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const active = ((seed >>> 16) & 1) === 1
      if (active !== previous) expected.push(active)
      previous = active
      host.emit(active)
    }
    await drainEvents()
    expect(actual).toEqual(expected)
    unsubscribe()
  })

  test("unsupported renderers fail on subscription rather than falling back to polling", () => {
    const subscribe = createNativeValueSubscription<boolean>(undefined, "window activation events")
    expect(() => subscribe(() => undefined)).toThrow("window activation events")
  })
})
