import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { FooterPanel } from "../footer"
import type { FooterView } from "../footer"
import { englishFooterLabels } from "@/app/locales/sections/footer"
import { createTestWindowActivity } from "../footer/verification/test-activity"
import { hydrateProject } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
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
          view="devices"
          onToggleFooter={() => {
            throw new Error("Unexpected input")
          }}
          onViewChange={() => {
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

test("active detail switch collapses its Footer and another switch reopens the chosen view", () => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  const activity = createTestWindowActivity()
  const root = createTestRoot({ width: 900, height: 500 })
  function Shell() {
    const [view, setView] = useState<FooterView>("devices")
    const [collapsed, setCollapsed] = useState(false)
    const choose = (next: FooterView) => {
      setView(next)
      setCollapsed(false)
    }
    return (
      <ThemeProvider>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
          <FooterPanel
            labels={englishFooterLabels}
            view={view}
            collapsed={collapsed}
            onViewChange={choose}
            onCollapsedChange={setCollapsed}
            reducedMotion
            subscribeWindowActive={activity.subscribe}
            renderClipEditor={() => {
              throw new Error("No selected Clip")
            }}
          />
          <StatusStrip
            labels={englishStatusLabels}
            view={view}
            footerCollapsed={collapsed}
            onViewChange={choose}
            onToggleFooter={() => setCollapsed(value => !value)}
            info={null}
            warnings={[]}
          />
        </div>
      </ThemeProvider>
    )
  }
  try {
    root.render(<Shell />)
    const devices = root.renderer.findByTestId("status-devices")
    const clip = root.renderer.findByTestId("status-clip")
    if (!devices || !clip) throw new Error("Missing view switches")
    root.renderer.nativeSimulateKeystrokes(devices.id, "enter")
    expect(root.renderer.findByTestId("footer-content")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(clip.id, "enter")
    expect(root.renderer.findByTestId("footer-content")).toBeDefined()
    expect(root.renderer.getPaintedText().join(" ")).toContain(englishFooterLabels.noClip)
    expect(root.renderer.findByTestId("footer-divider")).toBeUndefined()
  } finally {
    root.unmount()
  }
})
