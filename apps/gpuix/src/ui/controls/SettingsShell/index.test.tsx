import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { SettingsNavItem, SettingsShell } from "."

const items = [
  { id: "general", label: "General", content: <div testId="pane-general" /> },
  { id: "blocked", label: "Unavailable", disabled: true, content: <div testId="pane-blocked" /> },
  { id: "audio", label: "Audio", content: <div testId="pane-audio" /> },
]

test("settings shell navigates actual selected panes and closes through Escape", () => {
  const root = createTestRoot({ width: 900, height: 650 })
  let active = "general"
  let opened = true
  function Settings() {
    const [activeId, setActive] = useState("general")
    const [open, setOpen] = useState(true)
    return (
      <ThemeProvider>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div testId="before-settings" style={{ height: 1 }} />
          <SettingsShell
            testId="settings"
            title="Preferences"
            open={open}
            onOpenChange={next => {
              opened = next
              setOpen(next)
            }}
            items={items}
            activeId={activeId}
            onActiveChange={next => {
              active = next
              setActive(next)
            }}
          />
          <div testId="after-settings" style={{ height: 1 }} />
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Settings />)
  root.renderer.flush()
  const general = root.renderer.findByTestId("settings-nav-general")
  const shell = root.renderer.findByTestId("settings")
  if (!general || !shell) throw new Error("Missing settings controls")
  const before = root.renderer.findByTestId("before-settings")
  const after = root.renderer.findByTestId("after-settings")
  if (!before || !after) throw new Error("Missing layout markers")
  const beforeBounds = readOuterBounds(root.renderer, root.renderer.getElement(before.id))
  const afterBounds = readOuterBounds(root.renderer, root.renderer.getElement(after.id))
  if (!beforeBounds || !afterBounds) throw new Error("Unpainted layout markers")
  expect(afterBounds.y - beforeBounds.y - beforeBounds.height).toBe(520)
  expect(root.renderer.findByTestId("pane-general")).toBeDefined()
  root.renderer.nativeSimulateKeystrokes(general.id, "down")
  expect(active).toBe("audio")
  expect(root.renderer.findByTestId("pane-audio")).toBeDefined()
  expect(root.renderer.findByTestId("pane-general")).toBeUndefined()
  root.renderer.simulateKeystrokes("home")
  expect(active).toBe("general")
  root.renderer.simulateKeystrokes("escape")
  expect(opened).toBe(false)
  expect(root.renderer.findByTestId("settings")).toBeUndefined()
  root.unmount()
})

test("standalone settings navigation item activates only when enabled", () => {
  const spaces: boolean[] = []
  const root = createTestRoot({
    width: 300,
    height: 180,
    onKeyDown: event => {
      if (event.key === "space") spaces.push(event.defaultPrevented)
    },
  })
  const selected: string[] = []
  root.render(
    <ThemeProvider>
      <SettingsNavItem
        testId="nav"
        item={{ id: "general", label: "General" }}
        selected={false}
        onSelect={id => {
          selected.push(id)
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  const nav = root.renderer.findByTestId("nav")
  if (!nav) throw new Error("Missing navigation item")
  root.renderer.nativeSimulateKeystrokes(nav.id, "space")
  expect(selected).toEqual([])
  expect(spaces).toEqual([false])
  root.renderer.simulateKeystrokes("enter")
  expect(selected).toEqual(["general"])
  root.render(
    <ThemeProvider>
      <SettingsNavItem
        testId="nav"
        item={{ id: "blocked", label: "Unavailable", disabled: true }}
        selected={false}
        onSelect={id => {
          selected.push(id)
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  root.renderer.nativeSimulateKeystrokes(nav.id, "enter")
  expect(selected).toEqual(["general"])
  root.unmount()
})
