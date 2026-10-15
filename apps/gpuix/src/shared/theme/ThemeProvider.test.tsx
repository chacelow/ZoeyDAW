import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider, useTheme } from "./ThemeProvider"

let mounts = 0

function Probe() {
  const theme = useTheme()
  const [mountId] = useState(() => ++mounts)
  return <text>{`${theme.appearance}:${theme.colors.background}:${mountId}`}</text>
}

test("controlled appearance switches colors without remounting descendants", () => {
  mounts = 0
  const root = createTestRoot({ width: 200, height: 40 })
  try {
    root.render(
      <ThemeProvider appearance="dark">
        <Probe />
      </ThemeProvider>
    )
    const [dark] = root.renderer.getAllText()
    root.render(
      <ThemeProvider appearance="light">
        <Probe />
      </ThemeProvider>
    )
    const [light] = root.renderer.getAllText()
    expect(dark?.startsWith("dark:")).toBe(true)
    expect(light?.startsWith("light:")).toBe(true)
    expect(dark?.split(":")[1]).not.toBe(light?.split(":")[1])
    expect(light?.endsWith(":1")).toBe(true)
  } finally {
    root.unmount()
  }
})

test("defaultAppearance stays fixed after mount when uncontrolled", () => {
  const root = createTestRoot({ width: 200, height: 40 })
  try {
    root.render(
      <ThemeProvider defaultAppearance="light">
        <Probe />
      </ThemeProvider>
    )
    root.render(
      <ThemeProvider defaultAppearance="dark">
        <Probe />
      </ThemeProvider>
    )
    expect(root.renderer.getAllText()[0]?.startsWith("light:")).toBe(true)
  } finally {
    root.unmount()
  }
})
