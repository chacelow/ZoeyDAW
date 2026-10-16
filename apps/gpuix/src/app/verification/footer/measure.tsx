import { writeFileSync } from "node:fs"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { AnimationFrameProvider } from "@/platform/frame"
import { createTestAnimationFrames } from "@/project/sections/footer/verification/test-frame"
import { projectActions, useProjectState } from "@/project/adapters"
import { createDevice, DEVICE_KINDS } from "@/project/model/devices"
import { BrowserPanel } from "@/project/sections/browser"
import { englishBrowserLabels } from "@/app/locales/sections/browser"
import { TransportBar } from "@/project/sections/transport"
import { englishTransportLabels } from "@/app/locales/sections/transport"
import { FooterPanel } from "@/project/sections/footer"
import { englishFooterLabels } from "@/app/locales/sections/footer"
import { createTestWindowActivity } from "@/project/sections/footer/verification/test-activity"
import type { FooterView } from "@/project/sections/footer"

const activity = createTestWindowActivity()

projectActions.addTrack("audio")
const track = useProjectState.getState().document.tracks.find(item => item.kind === "audio")
if (!track) throw new Error("No authored measurement track")
projectActions.updateTrack(track.id, { devices: DEVICE_KINDS.map(createDevice) })
projectActions.selectTracks([track.id], "header")

function FooterMeasurement() {
  const [view, setView] = useState<FooterView>("devices")
  const [collapsed, setCollapsed] = useState(false)
  return (
    <FooterPanel
      labels={englishFooterLabels}
      view={view}
      collapsed={collapsed}
      onViewChange={setView}
      onCollapsedChange={setCollapsed}
      reducedMotion
      subscribeWindowActive={activity.subscribe}
      renderClipEditor={() => {
        throw new Error("Measurement has no selected clip")
      }}
    />
  )
}

const cases = [
  {
    name: "browser",
    width: 320,
    height: 640,
    content: <BrowserPanel labels={englishBrowserLabels} />,
    ids: [
      "browser-panel",
      "browser-split",
      "browser-search",
      "browser-navigation-panel",
      "browser-navigation-divider",
      "browser-results-panel",
      "browser-results",
      "browser-entry-tunings-12-TET",
      "browser-entry-instruments-wavetable",
    ],
  },
  {
    name: "transport",
    width: 620,
    height: 100,
    content: (
      <TransportBar
        labels={englishTransportLabels}
        reducedMotion
        onBack={projectActions.stop}
        onDrawModeChange={() => {
          throw new Error("Measurement does not dispatch draw commands")
        }}
        onToggleBrowser={() => {
          throw new Error("Measurement is read-only")
        }}
      />
    ),
    ids: [
      "transport-scroll",
      "transport-left",
      "transport-center",
      "transport-right",
      "transport-play",
      "transport-stop",
      "transport-record",
    ],
  },
  {
    name: "footer",
    width: 955,
    height: 300,
    content: <FooterMeasurement />,
    ids: [
      "footer-divider",
      "footer-content",
      ...(
        useProjectState.getState().document.tracks.find(item => item.id === track.id)?.devices ?? []
      ).map(device => `device-${device.id}`),
    ],
  },
]
const report = []
for (const entry of cases) {
  const root = createTestRoot({ width: entry.width, height: entry.height })
  const frames = createTestAnimationFrames()
  try {
    root.render(
      <ThemeProvider>
        <AnimationFrameProvider source={frames}>{entry.content}</AnimationFrameProvider>
      </ThemeProvider>
    )
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    const bounds = Object.fromEntries(
      entry.ids.map(id => {
        const element = root.renderer.findByTestId(id)
        if (!element) throw new Error(`Missing measured element ${id}`)
        return [id, root.renderer.getElementBounds(element.id)]
      })
    )
    const retainedBefore = root.renderer.getRetainedElementCount()
    if (process.argv[2]) root.renderer.captureScreenshot(`${process.argv[2]}.${entry.name}.png`)
    const results = root.renderer.findByTestId("browser-results")
    if (results) {
      root.renderer.scrollTo(results.id, 0, -10000)
      root.renderer.flush()
    }
    report.push({
      name: entry.name,
      viewport: { width: entry.width, height: entry.height },
      bounds,
      retainedBefore,
      retainedAfter: root.renderer.getRetainedElementCount(),
      scroll: results ? root.renderer.getScrollOffset(results.id) : null,
      frames: root.renderer.getDebugFrameOverlayStats(),
    })
  } finally {
    root.unmount()
  }
}
projectActions.stop()
const output = JSON.stringify(
  { renderer: "fixed-main-native-test-renderer", measurements: report },
  null,
  2
)
if (process.argv[2]) writeFileSync(process.argv[2], `${output}\n`)
process.stdout.write(`${output}\n`)
