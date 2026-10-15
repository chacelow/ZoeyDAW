import { beforeEach, expect, test } from "bun:test"
import { useState } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { createWindowKeyboard } from "@/platform/keyboard"
import { createVerificationKeyboard } from "./verification/keyboard"
import { FooterPanel } from "."
import { englishFooterLabels } from "./demo-labels"
import { createTestWindowActivity } from "./verification/test-activity"
import { createDevice } from "../../model/devices"
import type { FooterView } from "."

const activity = createTestWindowActivity()

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
        subscribeWindowActive={activity.subscribe}
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
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 800, height: 400, ...keyboard.rootHandlers })
  const owner = createVerificationKeyboard({
    windowKeyboard: keyboard,
    metrics: PROJECT_METRICS,
    size: { containerWidth: 800, bodyHeight: 400, timelineLeft: 0 },
    subscribeWindowActive: activity.subscribe,
    blurControl: () => {
      const divider = root.renderer.findByTestId("footer-divider")
      if (divider) root.renderer.focusElement(divider.id)
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
    owner.dispose()
    projectActions.stop()
  }
})

test("Clip Edit follows its host height and does not expose the fixed-device divider", () => {
  const root = createTestRoot({ width: 800, height: 500 })
  function frame(height: number) {
    root.render(
      <ThemeProvider>
        <div style={{ width: "100%", height }}>
          <FooterPanel
            labels={englishFooterLabels}
            view="clip"
            collapsed={false}
            onViewChange={() => {
              throw new Error("Unexpected tab change")
            }}
            onCollapsedChange={() => {
              throw new Error("Unexpected collapse")
            }}
            renderClipEditor={() => {
              throw new Error("No selected clip")
            }}
            reducedMotion
            subscribeWindowActive={activity.subscribe}
          />
        </div>
      </ThemeProvider>
    )
  }
  try {
    frame(220)
    expect(root.renderer.findByTestId("footer-divider")).toBeUndefined()
    const first = root.renderer.findByTestId("footer-content")
    if (!first) throw new Error("Missing Clip Edit container")
    expect(root.renderer.getElementBounds(first.id)?.height).toBe(220)
    frame(310)
    const resized = root.renderer.findByTestId("footer-content")
    if (!resized) throw new Error("Missing resized Clip Edit container")
    expect(root.renderer.getElementBounds(resized.id)?.height).toBe(310)
  } finally {
    root.unmount()
  }
})

test("device arrow focus also selects its active card", () => {
  const root = createTestRoot({ width: 800, height: 400 })
  try {
    const track = useProjectState.getState().document.tracks.find(item => item.kind === "audio")
    if (!track) throw new Error("Missing audio track")
    const devices = [createDevice("utility"), createDevice("filter")]
    projectActions.updateTrack(track.id, { devices })
    projectActions.selectTracks([track.id], "header")
    root.render(<FooterHarness />)
    const first = root.renderer.findByTestId(`device-handle-${devices[0]?.id}`)
    const second = root.renderer.findByTestId(`device-handle-${devices[1]?.id}`)
    const card = root.renderer.findByTestId(`device-${devices[1]?.id}`)
    const previousCard = root.renderer.findByTestId(`device-${devices[0]?.id}`)
    if (!first || !second || !card || !previousCard) throw new Error("Missing device handles")
    root.renderer.nativeSimulateKeystrokes(first.id, "right")
    expect(root.renderer.getFocusedElementId()).toBe(second.id)
    expect(root.renderer.getElement(card.id)?.style.borderColor).not.toBe(
      root.renderer.getElement(previousCard.id)?.style.borderColor
    )
  } finally {
    root.unmount()
  }
})
