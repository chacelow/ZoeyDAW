// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useState } from "react"
import { MotionTabs } from "@zoeymind/ui"

const options = [
  { key: "home", label: "Home", content: "Home content" },
  { key: "star", label: "Star", content: "Star content" },
  { key: "inbox", label: "Inbox", content: "Inbox content" },
]

function TabsWithReset() {
  const [tab, setTab] = useState("home")
  return (
    <>
      <button type="button" onClick={() => setTab("star")}>
        Reset to Star
      </button>
      <MotionTabs options={options} defaultTab={tab} onChange={setTab} />
    </>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("applies an external reset to a previously selected tab", () => {
  render(<TabsWithReset />)
  fireEvent.click(screen.getByRole("button", { name: "Star" }))
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }))
  expect(screen.getByText("Inbox content")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Reset to Star" }))
  expect(screen.getByText("Star content")).toBeTruthy()
  expect(screen.queryByText("Inbox content")).toBeNull()
})
