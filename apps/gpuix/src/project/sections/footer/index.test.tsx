import { beforeEach, expect, test } from "bun:test"
import { useState } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { Group, Panel, PanelDivider, PanelEnvironmentProvider } from "@/ui/panels"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, readProjectPeaks, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { createWindowKeyboard } from "@/platform/keyboard"
import { createNativeClipboard } from "@/platform/clipboard"
import { ClipEditor } from "@/project/sections/clip-edit"
import { demoLabels } from "@/project/sections/clip-edit/demo/labels"
import type { ClipEditorEnvironment } from "@/project/sections/clip-edit"
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

test("Add device menu appends exactly the chosen device kind", () => {
  const root = createTestRoot({ width: 900, height: 400 })
  try {
    const track = useProjectState.getState().document.tracks.find(item => item.kind === "audio")
    if (!track) throw new Error("Missing track")
    projectActions.updateTrack(track.id, { devices: [createDevice("utility")] })
    projectActions.selectTracks([track.id], "header")
    root.render(<FooterHarness />)
    const add = root.renderer.findByTestId("device-add")
    if (!add) throw new Error("Missing Add command")
    root.renderer.nativeSimulateKeystrokes(add.id, "enter")
    const reverb = root.renderer.findByTestId("device-add-reverb")
    if (!reverb) throw new Error("Missing Reverb choice")
    root.renderer.nativeSimulateKeystrokes(reverb.id, "enter")
    expect(
      useProjectState
        .getState()
        .document.tracks.find(item => item.id === track.id)
        ?.devices?.map(device => device.kind)
    ).toEqual(["utility", "reverb"])
  } finally {
    root.unmount()
  }
})

test("native Clip host divider drag changes the Footer height continuously", () => {
  const root = createTestRoot({ width: 900, height: 600 })
  try {
    root.render(
      <ThemeProvider>
        <PanelEnvironmentProvider environment={{ subscribeWindowActive: activity.subscribe }}>
          <Group orientation="vertical" style={{ width: "100%", height: "100%" }}>
            <Panel defaultSize="60%" minSize="20%">
              <div />
            </Panel>
            <PanelDivider orientation="horizontal" testId="clip-host-divider" />
            <Panel defaultSize="40%" minSize="20%">
              <FooterPanel
                labels={englishFooterLabels}
                view="clip"
                collapsed={false}
                reducedMotion
                subscribeWindowActive={activity.subscribe}
                onViewChange={() => {
                  throw new Error("Unexpected tab")
                }}
                onCollapsedChange={() => {
                  throw new Error("Unexpected collapse")
                }}
                renderClipEditor={() => {
                  throw new Error("No selected Clip")
                }}
              />
            </Panel>
          </Group>
        </PanelEnvironmentProvider>
      </ThemeProvider>
    )
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    const divider = root.renderer.findByTestId("clip-host-divider")
    const footer = root.renderer.findByTestId("footer-content")
    const initialDivider = divider ? root.renderer.getElementBounds(divider.id) : null
    const initialFooter = footer ? root.renderer.getElementBounds(footer.id) : null
    if (!divider || !footer || !initialDivider || !initialFooter)
      throw new Error("Missing Clip host geometry")
    const x = initialDivider.x + initialDivider.width / 2
    const y = initialDivider.y + initialDivider.height / 2
    root.renderer.nativeSimulateMouseDown(x, y)
    root.renderer.nativeSimulateMouseMove(x, y - 40, 0)
    root.renderer.nativeSimulateMouseUp(x, y - 40)
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    expect(root.renderer.getElementBounds(footer.id)?.height).toBeCloseTo(
      initialFooter.height + 40,
      0
    )
    expect(root.renderer.getElementBounds(divider.id)?.y).toBeCloseTo(initialDivider.y - 40, 0)
  } finally {
    root.unmount()
  }
})

test("the ID slot keeps one real MIDI editor live through a velocity edit and Undo", () => {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "midi")
  if (!track) throw new Error("Missing MIDI fixture")
  track.clips.push({
    id: "footer-midi",
    kind: "midi",
    startBar: 1,
    lengthBars: 1,
    notes: [{ id: "footer-note", pitch: 64, startBeat: 0, lengthBeats: 1, velocity: 80 }],
  })
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  projectActions.selectClips(["footer-midi"])
  const environment: ClipEditorEnvironment = {
    clipboard: createNativeClipboard(),
    subscribeWindowActive: activity.subscribe,
    drawMode: {
      markGesture: () => {
        throw new Error("Unexpected draw gesture")
      },
      latch: enabled => projectActions.setMode("drawMode", enabled),
    },
    onRegionKey: () => {
      throw new Error("Editing key escaped its owner")
    },
  }
  const root = createTestRoot({ width: 900, height: 420 })
  const unexpected = () => {
    throw new Error("Unexpected Footer view transition")
  }
  try {
    root.render(
      <ThemeProvider>
        <FooterPanel
          labels={englishFooterLabels}
          view="clip"
          collapsed={false}
          reducedMotion
          subscribeWindowActive={activity.subscribe}
          onViewChange={unexpected}
          onCollapsedChange={unexpected}
          renderClipEditor={slot => (
            <ClipEditor
              {...slot}
              labels={demoLabels.en}
              readPeaks={readProjectPeaks}
              environment={environment}
            />
          )}
        />
      </ThemeProvider>
    )
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    const stem = root.renderer.findByTestId("midi-velocity-footer-note")
    if (!stem) throw new Error("The ID slot did not mount the selected MIDI editor")
    root.renderer.nativeSimulateKeystrokes(stem.id, "up")
    const velocity = () => {
      const clip = useProjectState
        .getState()
        .document.tracks.find(item => item.id === track.id)
        ?.clips.find(item => item.id === "footer-midi")
      if (clip?.kind !== "midi") throw new Error("MIDI fixture was lost")
      return clip.notes[0]?.velocity
    }
    expect(velocity()).toBe(81)
    expect(
      root.renderer.findByType("div").filter(node => node.testId === "clip-editor")
    ).toHaveLength(1)
    root.renderer.nativeSimulateKeystrokes(stem.id, "cmd-z")
    expect(velocity()).toBe(80)
    expect(root.renderer.findByTestId("midi-editor")).toBeDefined()
  } finally {
    root.unmount()
  }
})
