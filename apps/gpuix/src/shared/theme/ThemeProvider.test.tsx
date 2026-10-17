import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { DEFAULT_THEME_PRESET, getThemePreset } from "./presets"
import { ThemeProvider, useTheme } from "./ThemeProvider"
import type { TestRoot } from "@gpuix/react/testing"
import type { Appearance } from "./ThemeProvider"
import type { ThemePresetId } from "./presets"
import { DEFAULT_DESIGN_TOKENS } from "./design-tokens"
import { colorMix } from "./color-mix"

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

test("without controlled props, defaultAppearance picks the scheme and default preset the colors", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  const { light, dark } = getThemePreset(DEFAULT_THEME_PRESET).colors
  root.render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`${DEFAULT_THEME_PRESET}|dark|${dark.primary}|0`)
  root.render(
    <ThemeProvider defaultAppearance="light">
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`${DEFAULT_THEME_PRESET}|light|${light.primary}|0`)
  root.render(
    <ThemeProvider defaultAppearance="light" appearance="dark">
      <Probe />
    </ThemeProvider>
  )
  expect(read(root)).toBe(`${DEFAULT_THEME_PRESET}|dark|${dark.primary}|0`)
  root.unmount()
})

test("controlled color recipes recolor the mounted surface without resetting child state", () => {
  const root = createTestRoot({ width: 300, height: 100 })
  try {
    root.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    click(root)
    const base = getThemePreset(DEFAULT_THEME_PRESET).baseColors.dark
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          colorRecipes: { ...DEFAULT_DESIGN_TOKENS.colorRecipes, arrangementSurface: 61 },
        }}
      >
        <Probe />
      </ThemeProvider>
    )
    expect(root.renderer.findByTestId("probe")?.style.backgroundColor).toBe(
      colorMix(base.card, 61, base.foreground)
    )
    expect(read(root)).toBe(`${DEFAULT_THEME_PRESET}|dark|${base.primary}|1`)
  } finally {
    root.unmount()
  }
})
