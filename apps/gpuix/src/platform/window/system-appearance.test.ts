import { describe, expect, test } from "bun:test"
import { createWindowPlatform } from "./index"
import type { SystemAppearance } from "./index"

async function drainEvents() {
  await new Promise<void>(resolve => {
    queueMicrotask(resolve)
  })
}

describe("system appearance port", () => {
  test("reports appearance changes after the baseline and releases its own observer", async () => {
    const native: { emit: ((appearance: SystemAppearance) => void) | null } = { emit: null }
    const baseline: SystemAppearance = "dark"
    const active = true
    const activity: Array<"start" | "stop"> = []
    const platform = createWindowPlatform({
      onWindowActiveChange(callback) {
        activity.push(callback ? "start" : "stop")
        callback?.(active)
      },
      onWindowAppearanceChange(callback) {
        native.emit = callback
        callback?.(baseline)
      },
    })
    const changes: SystemAppearance[] = []
    const unsubscribe = platform.subscribeSystemAppearance(appearance => {
      changes.push(appearance)
    })
    const stopActivity = platform.subscribeApplicationActive(() => undefined)
    await drainEvents()
    expect(changes).toEqual([])

    native.emit?.("light")
    native.emit?.("light")
    await drainEvents()
    expect(changes).toEqual(["light"])

    unsubscribe()
    expect(native.emit).toBeNull()
    expect(activity).toEqual(["start"])
    stopActivity()
    expect(activity).toEqual(["start", "stop"])
  })

  test("the current appearance is readable before any change for the first theme", () => {
    let current: SystemAppearance = "dark"
    const platform = createWindowPlatform({ getWindowAppearance: () => current })
    expect(platform.getSystemAppearance()).toBe("dark")
    current = "light"
    expect(platform.getSystemAppearance()).toBe("light")
  })

  test("renderers without appearance support fail loudly instead of guessing", () => {
    const platform = createWindowPlatform({})
    expect(() => platform.subscribeSystemAppearance(() => undefined)).toThrow(
      "window appearance events"
    )
    expect(() => platform.getSystemAppearance()).toThrow("window appearance queries")
  })
})
