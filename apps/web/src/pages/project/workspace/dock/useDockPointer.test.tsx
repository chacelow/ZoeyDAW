// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useRef, useState } from "react"
import { useDockPointer } from "./useDockPointer"
import { getGroups, type DockLayoutJSON } from "./model"

const initial: DockLayoutJSON = {
  version: 2,
  root: { kind: "group", id: "center", tabs: ["one", "two"], active: "one" },
  hidden: [],
  activeGroup: "center",
  maximizedGroup: null,
  borders: {
    left: { tabs: [], end: [], selected: null, size: 260, type: "split" },
    right: { tabs: [], end: [], selected: null, size: 260, type: "split" },
    bottom: { tabs: [], end: [], selected: null, size: 260, type: "split" },
  },
}
const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
  toJSON() {},
})
function Fixture({ committed }: { committed: (layout: DockLayoutJSON) => void }) {
  const [layout, setLayout] = useState(initial)
  const root = useRef<HTMLDivElement>(null)
  const drag = useDockPointer({
    layout,
    commit: next => {
      setLayout(next)
      committed(next)
    },
    root,
    strip: 26,
    borderSize: 260,
    threshold: 3,
  })
  return (
    <div ref={root} id="pointer-fixture" data-testid="dock">
      <div data-testid="dock-border-left" />
      <div data-testid="dock-border-right" />
      <div data-testid="dock-border-bottom" />
      <button type="button" onBlur={drag.cancel}>
        Previous tab
      </button>
      {getGroups(layout.root).map(group => (
        <div key={group.id} data-dock-group={group.id} />
      ))}
      <button
        type="button"
        onPointerDown={event => drag.start({ groupId: "center", tabId: "one" }, event)}
        onPointerMove={drag.move}
        onPointerUp={drag.release}
        onPointerCancel={drag.cancel}
        onClick={() => drag.click(() => {})}
      >
        One
      </button>
      {drag.target && (
        <span
          data-testid="target"
          data-rail={drag.target.border}
          data-group={drag.target.railGroup}
          data-index={drag.target.index}
        />
      )}
    </div>
  )
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const id = this.dataset.testid
    if (id === "dock-border-left") return rect(0, 0, 26, 700)
    if (id === "dock-border-right") return rect(874, 0, 26, 700)
    if (id === "dock-border-bottom") return rect(26, 674, 848, 26)
    return rect(26, 0, 848, 674)
  })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value() {} },
    hasPointerCapture: {
      configurable: true,
      value() {
        return false
      },
    },
    releasePointerCapture: { configurable: true, value() {} },
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it("drops at the rail start without auto-expanding the border", () => {
  const commit = vi.fn()
  const view = render(<Fixture committed={commit} />)
  const tab = view.getByRole("button", { name: "One" })
  fireEvent.pointerDown(tab, { pointerId: 1, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 1, clientX: 875, clientY: 35 })
  expect(view.getByTestId("target").dataset.group).toBe("start")
  fireEvent.pointerUp(tab, { pointerId: 1, clientX: 875, clientY: 35 })
  expect(commit).toHaveBeenCalledOnce()
  expect(commit.mock.lastCall?.[0].borders.right.tabs).toEqual(["one"])
  expect(commit.mock.lastCall?.[0].borders.right.selected).toBeNull()
})

it("places tabs into the rail end and cancels after Escape or lost window focus", () => {
  const commit = vi.fn()
  const view = render(<Fixture committed={commit} />)
  const tab = view.getByRole("button", { name: "One" })
  fireEvent.pointerDown(tab, { pointerId: 3, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 3, clientX: 875, clientY: 650 })
  expect(view.getByTestId("target").dataset.group).toBe("end")
  fireEvent.keyDown(window, { key: "Escape" })
  expect(view.queryByTestId("target")).toBeNull()
  fireEvent.pointerUp(tab, { pointerId: 3, clientX: 875, clientY: 650 })
  expect(commit).not.toHaveBeenCalled()
  fireEvent.pointerDown(tab, { pointerId: 4, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 4, clientX: 875, clientY: 650 })
  fireEvent.blur(window)
  fireEvent.pointerUp(tab, { pointerId: 4, clientX: 875, clientY: 650 })
  expect(commit).not.toHaveBeenCalled()
  fireEvent.pointerDown(tab, { pointerId: 5, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 5, clientX: 875, clientY: 650 })
  fireEvent.pointerUp(tab, { pointerId: 5, clientX: 875, clientY: 650 })
  expect(commit).toHaveBeenCalledOnce()
  expect(commit.mock.lastCall?.[0].borders.right.end).toEqual(["one"])
})

it("does not preview or move below the native three-pixel drag threshold", () => {
  const commit = vi.fn()
  const view = render(<Fixture committed={commit} />)
  const tab = view.getByRole("button", { name: "One" })
  fireEvent.pointerDown(tab, { pointerId: 6, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 6, clientX: 51, clientY: 51 })
  expect(view.queryByTestId("target")).toBeNull()
  fireEvent.pointerUp(tab, { pointerId: 6, clientX: 51, clientY: 51 })
  expect(commit).not.toHaveBeenCalled()
})

it("starts a new drag after the previously focused tab releases focus", () => {
  const commit = vi.fn()
  const view = render(<Fixture committed={commit} />)
  view.getByRole("button", { name: "Previous tab" }).focus()
  const tab = view.getByRole("button", { name: "One" })
  fireEvent.pointerDown(tab, { pointerId: 4, button: 0, clientX: 50, clientY: 50 })
  fireEvent.pointerMove(tab, { pointerId: 4, clientX: 875, clientY: 35 })
  fireEvent.pointerUp(tab, { pointerId: 4, clientX: 875, clientY: 35 })
  expect(commit.mock.lastCall?.[0].borders.right.tabs).toEqual(["one"])
})
