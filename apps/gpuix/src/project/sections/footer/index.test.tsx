import { beforeEach, expect, test } from "bun:test"
import { useState } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { handleTransportKeyDown } from "../transport"
import { FooterPanel } from "."
import { englishFooterLabels } from "./demo-labels"
import type { FooterView } from "."

beforeEach(() =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
)
function FooterHarness() {
  const [view, setView] = useState<FooterView>("devices")
  const [collapsed, setCollapsed] = useState(false)
  return (
    <ThemeProvider>
      <FooterPanel
        labels={englishFooterLabels}
        view={view}
        collapsed={collapsed}
        onViewChange={setView}
        onCollapsedChange={setCollapsed}
        reducedMotion
        renderClipEditor={() => {
          throw new Error("Clip selection must not open its editor")
        }}
      />
    </ThemeProvider>
  )
}

test("selecting a clip keeps Affect Chain visible and does not construct a clip editor", () => {
  const root = createTestRoot({ width: 800, height: 400 })
  try {
    root.render(<FooterHarness />)
    const clip = useProjectState.getState().document.tracks.flatMap(track => track.clips)[0]
    if (!clip) throw new Error("Missing clip fixture")
    flushSync(() => projectActions.selectClips([clip.id]))
    root.renderer.flush()
    expect(root.renderer.findByTestId("motion-tab-devices")).toBeDefined()
    expect(root.renderer.getPaintedText().join(" ")).toContain(englishFooterLabels.title)
    expect(root.renderer.getPaintedText().join(" ")).not.toContain(englishFooterLabels.noClip)
  } finally {
    root.unmount()
  }
})

test("footer divider only collapses and expands the fixed-height chain, preserving the chosen view", () => {
  const root = createTestRoot({ width: 800, height: 400 })
  try {
    root.render(<FooterHarness />)
    const content = root.renderer.findByTestId("footer-content")
    const divider = root.renderer.findByTestId("footer-divider")
    if (!content || !divider) throw new Error("Missing footer geometry")
    expect(root.renderer.getElementBounds(content.id)?.height).toBe(
      PROJECT_METRICS.footerDeviceHeight
    )
    root.renderer.nativeSimulateKeystrokes(divider.id, "down")
    expect(root.renderer.findByTestId("footer-content")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(divider.id, "up")
    const expanded = root.renderer.findByTestId("footer-content")
    if (!expanded) throw new Error("Footer did not expand")
    expect(root.renderer.getElementBounds(expanded.id)?.height).toBe(
      PROJECT_METRICS.footerDeviceHeight
    )
    const clipTab = root.renderer.findByTestId("motion-tab-clip")
    if (!clipTab) throw new Error("Missing Clip Edit tab")
    root.renderer.nativeSimulateKeystrokes(clipTab.id, "enter")
    expect(root.renderer.getPaintedText().join(" ")).toContain(englishFooterLabels.noClip)
    expect(root.renderer.getPaintedText().join(" ")).not.toContain(englishFooterLabels.noTrack)
  } finally {
    root.unmount()
  }
})

test("Space on a Footer tab controls playback without switching the editor", () => {
  const root = createTestRoot({
    width: 800,
    height: 400,
    onKeyDown: event => {
      handleTransportKeyDown(event)
    },
  })
  try {
    root.render(<FooterHarness />)
    const clipTab = root.renderer.findByTestId("motion-tab-clip")
    if (!clipTab) throw new Error("Missing Clip Edit tab")
    root.renderer.nativeSimulateKeystrokes(clipTab.id, "space")
    expect(root.renderer.getPaintedText().join(" ")).not.toContain(englishFooterLabels.noClip)
    expect(useProjectState.getState().session.playing).toBe(true)
  } finally {
    root.unmount()
    projectActions.stop()
  }
})
