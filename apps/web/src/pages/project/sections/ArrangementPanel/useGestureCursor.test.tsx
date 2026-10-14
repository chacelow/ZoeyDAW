// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { useGestureCursor } from "./useGestureCursor"
import type { GestureCursor } from "./useGestureCursor"

function Owner({ cursor }: { readonly cursor: GestureCursor | null }) {
  useGestureCursor(cursor)
  return null
}

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute("data-arrangement-cursor")
})

it("removes a finished cursor without resurrecting it after another gesture ends", () => {
  const first = render(<Owner cursor="grabbing" />)
  const second = render(<Owner cursor="ns-resize" />)
  expect(document.documentElement.getAttribute("data-arrangement-cursor")).toBe("ns-resize")
  first.unmount()
  expect(document.documentElement.getAttribute("data-arrangement-cursor")).toBe("ns-resize")
  second.unmount()
  expect(document.documentElement.hasAttribute("data-arrangement-cursor")).toBe(false)
})

it("restores a previous document cursor only after the last owner leaves", () => {
  document.documentElement.setAttribute("data-arrangement-cursor", "crosshair")
  const first = render(<Owner cursor="grabbing" />)
  const second = render(<Owner cursor="ew-resize" />)
  second.unmount()
  expect(document.documentElement.getAttribute("data-arrangement-cursor")).toBe("grabbing")
  first.unmount()
  expect(document.documentElement.getAttribute("data-arrangement-cursor")).toBe("crosshair")
})
