import { describe, expect, test } from "bun:test"
import { createWindowKeyboard } from "."
import type { WindowKeyEvent } from "."

function keyEvent(): WindowKeyEvent {
  let prevented = false
  return {
    key: "space",
    get defaultPrevented() {
      return prevented
    },
    preventDefault() {
      prevented = true
    },
    stopPropagation() {},
  }
}

describe("WindowKeyboard", () => {
  test("unsubscribed sections no longer receive key releases", () => {
    const keyboard = createWindowKeyboard()
    const events: string[] = []
    keyboard.subscribe("keyDown", event => {
      events.push(`down:${event.key}`)
    })
    const unsubscribe = keyboard.subscribe("keyUp", event => {
      events.push(`up:${event.key}`)
    })
    keyboard.rootHandlers.onKeyDown(keyEvent())
    keyboard.rootHandlers.onKeyUp(keyEvent())
    unsubscribe()
    unsubscribe()
    keyboard.rootHandlers.onKeyUp(keyEvent())
    expect(events).toEqual(["down:space", "up:space"])
  })

  test("a consumed key does not trigger a second section command", () => {
    const keyboard = createWindowKeyboard()
    const commands: string[] = []
    keyboard.subscribe("keyDown", event => {
      commands.push("toggle playback")
      event.preventDefault()
    })
    keyboard.subscribe("keyDown", () => {
      commands.push("insert space")
    })
    keyboard.rootHandlers.onKeyDown(keyEvent())
    expect(commands).toEqual(["toggle playback"])
  })

  test("roots do not share subscriptions", () => {
    const first = createWindowKeyboard()
    const second = createWindowKeyboard()
    let received = 0
    first.subscribe("keyDown", () => received++)
    second.rootHandlers.onKeyDown(keyEvent())
    expect(received).toBe(0)
  })
})
