import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { getThemePreset } from "./presets"
import { ThemeProvider, useTheme } from "./ThemeProvider"
import type { TestRoot } from "@gpuix/react/testing"
import type { Appearance } from "./ThemeProvider"
import type { ThemePresetId } from "./presets"

/** Renders the theme it reads plus a click counter that only survives if it is not remounted. */
function Probe() {
  const theme = useTheme()
  const [clicks, setClicks] = useState(0)
  return (
    <div
      role="button"
      tabIndex={0}
      testId="probe"
      style={{ width: 200, height: 40, backgroundColor: theme.colors.arrangementSurface }}
      onMouseDown={() => setClicks(count => count + 1)}
    >
      <text testId="read">{`${theme.preset}|${theme.appearance}|${theme.colors.primary}|${clicks}`}</text>
    </div>
  )
}

function read(root: TestRoot) {
  const node = root.renderer.findByTestId("read")
  return node?.children.map(id => root.renderer.getElement(id)?.text ?? "").join("")
}

function click(root: TestRoot) {
  const probe = root.renderer.findByTestId("probe")
  const box = probe && root.renderer.getElementBounds(probe.id)
  if (!box) throw new Error("probe not laid out")
  root.renderer.nativeSimulateClick(box.x + 5, box.y + 5)
}

test("controlled preset and appearance recolor the same child without remounting it", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  const show = (preset: ThemePresetId, appearance: Appearance) =>
    root.render(
      <ThemeProvider preset={preset} appearance={appearance}>
        <Probe />
      </ThemeProvider>
    )

  show("default", "dark")
  click(root)
  click(root)
  expect(read(root)).toBe(`default|dark|${getThemePreset("default").colors.dark.primary}|2`)

  show("catppuccin", "dark")
  const catppuccin = getThemePreset("catppuccin").colors
  expect(read(root)).toBe(`catppuccin|dark|${catppuccin.dark.primary}|2`)
  expect(root.renderer.findByTestId("probe")?.style.backgroundColor).toBe(
    catppuccin.dark.arrangementSurface
  )

  show("catppuccin", "light")
  expect(read(root)).toBe(`catppuccin|light|${catppuccin.light.primary}|2`)
  click(root)
  expect(read(root)).toBe(`catppuccin|light|${catppuccin.light.primary}|3`)
  root.unmount()
})

test("uncontrolled provider keeps the old contract: defaultAppearance with the Default preset", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  const { light, dark } = getThemePreset("default").colors
  root.render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`default|dark|${dark.primary}|0`)
  root.render(
    <ThemeProvider defaultAppearance="light">
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`default|light|${light.primary}|0`)
  root.render(
    <ThemeProvider defaultAppearance="light" appearance="dark">
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`default|dark|${dark.primary}|0`)
  root.unmount()
})
