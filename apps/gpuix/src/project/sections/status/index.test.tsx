import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { StatusStrip } from "."
import { englishStatusLabels } from "./demo-labels"
import type { ControlInfo } from "../../../ui/controls"
import type { StatusWarning } from "."

test("control help takes precedence over the latest warning and clearing help restores that warning", () => {
  const root = createTestRoot({ width: 1000, height: 100 })
  const warnings: readonly StatusWarning[] = [
    { message: "Older warning", severity: "warning" },
    { message: "Device disconnected", severity: "error" },
  ]
  const render = (info: ControlInfo | null) =>
    root.render(
      <ThemeProvider>
        <StatusStrip
          labels={englishStatusLabels}
          footerCollapsed={false}
          onToggleFooter={() => {
            throw new Error("Unexpected input")
          }}
          info={info}
          warnings={warnings}
        />
      </ThemeProvider>
    )
  try {
    render("number")
    expect(root.renderer.getPaintedText().join(" ")).toContain(
      englishStatusLabels.info.number.description
    )
    expect(root.renderer.getPaintedText().join(" ")).not.toContain("Device disconnected")
    render(null)
    expect(root.renderer.getPaintedText().join(" ")).toContain("Device disconnected")
    expect(root.renderer.getPaintedText().join(" ")).not.toContain("Older warning")
    expect(root.renderer.getPaintedText().join(" ")).not.toContain(
      englishStatusLabels.info.number.description
    )
  } finally {
    root.unmount()
  }
})

test("status footer toggle controls visibility without duplicating dock view tabs", () => {
  const root = createTestRoot({ width: 900, height: 100 })
  function Shell() {
    const [collapsed, setCollapsed] = useState(false)
    return <ThemeProvider><StatusStrip labels={englishStatusLabels} footerCollapsed={collapsed} onToggleFooter={() => setCollapsed(value => !value)} info={null} warnings={[]} /></ThemeProvider>
  }
  try {
    root.render(<Shell />)
    const button = root.renderer.findByTestId("status-toggle-footer")
    if (!button) throw new Error("Missing footer toggle")
    expect(button.customProps?.["aria-expanded"]).toBe(true)
    root.renderer.nativeSimulateKeystrokes(button.id, "enter")
    expect(root.renderer.findByTestId("status-toggle-footer")?.customProps?.["aria-expanded"]).toBe(false)
    expect(root.renderer.findByTestId("status-clip")).toBeUndefined()
    expect(root.renderer.findByTestId("status-devices")).toBeUndefined()
  } finally { root.unmount() }
})
