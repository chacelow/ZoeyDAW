// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  actionAfterGuard,
  closeButtonAction,
  getCloseBehavior,
  setCloseBehavior,
  CLOSE_BEHAVIOR_KEY,
} from "./close-behavior"

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe("window close behavior", () => {
  it("re-evaluates the close-button policy after dirty sessions are handled", () => {
    expect(actionAfterGuard("close-button", "ask")).toBe("ask")
    expect(actionAfterGuard("close-button", "tray")).toBe("hide-to-tray")
    expect(actionAfterGuard("close-button", "quit")).toBe("allow-close")
  })

  it("keeps explicit tray-menu exit independent from close-button preferences", () => {
    expect(actionAfterGuard("explicit-exit", "ask")).toBe("exit-process")
    expect(actionAfterGuard("explicit-exit", "tray")).toBe("exit-process")
    expect(actionAfterGuard("explicit-exit", "quit")).toBe("exit-process")
  })

  it("maps every persisted close behavior to one action", () => {
    expect(closeButtonAction("ask")).toBe("ask")
    expect(closeButtonAction("tray")).toBe("hide-to-tray")
    expect(closeButtonAction("quit")).toBe("allow-close")
  })
})

it.each(["ask", "tray", "quit"] as const)("preserves the persisted %s close policy", behavior => {
  expect(setCloseBehavior(behavior)).toBe(true)
  expect(getCloseBehavior()).toBe(behavior)
})

it("fails safely to ask when the persisted close policy is invalid or inaccessible", () => {
  localStorage.setItem(CLOSE_BEHAVIOR_KEY, "unexpected")
  expect(getCloseBehavior()).toBe("ask")
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable")
  })
  expect(getCloseBehavior()).toBe("ask")
})

it("reports a preference write failure without pretending it was persisted", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable")
  })
  expect(setCloseBehavior("quit")).toBe(false)
  expect(getCloseBehavior()).toBe("ask")
})
