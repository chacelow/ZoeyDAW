import { beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import type { DesignTokens } from "@/shared/theme/design-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createDevice } from "@/project/model/devices"
import { FooterPanel } from "."
import { englishFooterLabels } from "@/app/locales/sections/footer"

const device = createDevice("filter")
beforeEach(() => {
  const document = createMockDocument()
  const track = document.tracks.find(item => item.kind === "audio")
  if (!track) throw new Error("Missing audio track")
  track.devices = [device, createDevice("utility")]
  hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
  projectActions.selectTracks([track.id], "header")
})
function box(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  const bounds = node && root.renderer.getElementBounds(node.id)
  if (!node || !bounds) throw new Error(`Missing ${testId}`)
  return { node, ...bounds }
}
function render(root: TestRoot, design = DEFAULT_DESIGN_TOKENS, project = PROJECT_METRICS) {
  root.render(
    <ThemeProvider design={design} project={project}>
      <FooterPanel
        labels={englishFooterLabels}
        view="devices"
        collapsed={false}
        reducedMotion
        onViewChange={() => {}}
        onCollapsedChange={() => {}}
        renderClipEditor={() => null}
        subscribeWindowActive={() => () => {}}
      />
    </ThemeProvider>
  )
  for (let pass = 0; pass < 6; pass++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function drag(root: TestRoot) {
  const handle = box(root, `device-handle-${device.id}`)
  root.renderer.nativeSimulateMouseDown(handle.x + handle.width / 2, handle.y + handle.height / 2)
  root.renderer.nativeSimulateMouseMove(850, handle.y + handle.height / 2, 0)
  root.renderer.flush()
}
function compare(
  design: DesignTokens,
  project = PROJECT_METRICS,
  activate: (root: TestRoot) => void = () => {}
) {
  const root = createTestRoot({ width: 900, height: 400 })
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-footer-configuration-"))
  const pixels = (name: string) => {
    const file = path.join(directory, `${name}.png`)
    root.renderer.captureScreenshot(file)
    return readFileSync(file)
  }
  try {
    render(root)
    activate(root)
    const before = pixels("before")
    render(root, design, project)
    expect(pixels("after").equals(before)).toBe(false)
    render(root)
    expect(pixels("restored").equals(before)).toBe(true)
  } finally {
    root.unmount()
    rmSync(directory, { recursive: true, force: true })
  }
}
test("footer device border changes native content inset", () => {
  const root = createTestRoot({ width: 900, height: 400 })
  try {
    render(root)
    const before = box(root, `device-handle-${device.id}`)
    render(root, {
      ...DEFAULT_DESIGN_TOKENS,
      shape: { ...DEFAULT_DESIGN_TOKENS.shape, cardBorderWidth: 4 },
    })
    expect(box(root, `device-handle-${device.id}`).y - before.y).toBe(3)
  } finally {
    root.unmount()
  }
})
for (const field of ["footerRadius", "footerJoinedGroupGap"] as const) {
  test(`footer native paint follows tabs ${field}`, () => {
    compare({ ...DEFAULT_DESIGN_TOKENS, tabs: { ...DEFAULT_DESIGN_TOKENS.tabs, [field]: 7 } })
  })
}
test("device curve native paint follows project response stroke", () => {
  compare(DEFAULT_DESIGN_TOKENS, { ...PROJECT_METRICS, deviceResponseStrokeWidth: 5 })
})
test("disabled device native paint follows disabled opacity", () => {
  const track = useProjectState
    .getState()
    .document.tracks.find(item => item.devices?.some(item => item.id === device.id))
  if (!track) throw new Error("Missing device track")
  projectActions.updateTrack(track.id, {
    devices: track.devices?.map(item => ({ ...item, enabled: false })),
  })
  compare({
    ...DEFAULT_DESIGN_TOKENS,
    states: { ...DEFAULT_DESIGN_TOKENS.states, disabledOpacity: 0.15 },
  })
})
test("dragging device native paint follows its independent opacity", () => {
  compare(
    {
      ...DEFAULT_DESIGN_TOKENS,
      states: { ...DEFAULT_DESIGN_TOKENS.states, deviceDragSourceOpacity: 0.15 },
    },
    PROJECT_METRICS,
    drag
  )
})
test("device chain insertion paint follows insertion line width", () => {
  compare(
    {
      ...DEFAULT_DESIGN_TOKENS,
      editor: { ...DEFAULT_DESIGN_TOKENS.editor, insertionLineWidth: 5 },
    },
    PROJECT_METRICS,
    drag
  )
})
for (const field of ["grab", "grabbing"] as const) {
  test(`device pointer state resolves configured ${field} cursor`, () => {
    const root = createTestRoot({ width: 900, height: 400 })
    try {
      render(root, {
        ...DEFAULT_DESIGN_TOKENS,
        cursors: { ...DEFAULT_DESIGN_TOKENS.cursors, [field]: "crosshair" },
      })
      if (field === "grabbing") drag(root)
      const handle = box(root, `device-handle-${device.id}`)
      if (field === "grab")
        root.renderer.nativeSimulateMouseMove(
          handle.x + handle.width / 2,
          handle.y + handle.height / 2
        )
      expect(root.renderer.getElement(handle.node.id)?.style.cursor).toBe("crosshair")
    } finally {
      root.unmount()
    }
  })
}
