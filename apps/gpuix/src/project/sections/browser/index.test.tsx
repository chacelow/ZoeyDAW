import { beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { hydrateProject, projectActions, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { createWindowKeyboard } from "@/platform/keyboard"
import { PROJECT_METRICS } from "@zoeymind/ui/metrics"
import { createVerificationKeyboard } from "../footer/verification/keyboard"
import { createTestWindowActivity } from "../footer/verification/test-activity"
import { BrowserPanel } from "."
import { englishBrowserLabels } from "./demo-labels"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
)

function mount() {
  const keyboard = createWindowKeyboard()
  const root = createTestRoot({ width: 600, height: 640, ...keyboard.rootHandlers })
  const activity = createTestWindowActivity()
  const owner = createVerificationKeyboard({
    windowKeyboard: keyboard,
    metrics: PROJECT_METRICS,
    size: { containerWidth: 600, bodyHeight: 640, timelineLeft: 0 },
    subscribeWindowActive: activity.subscribe,
    blurControl: () => {
      const tree = root.renderer.findByTestId("browser-results")
      if (tree) root.renderer.focusElement(tree.id)
    },
  })
  root.render(
    <ThemeProvider>
      <BrowserPanel labels={englishBrowserLabels} />
    </ThemeProvider>
  )
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  const unmount = root.unmount
  root.unmount = () => {
    unmount()
    owner.dispose()
  }
  return root
}

test("Enter selects the focused resource, arrows expand and visit children, and Left restores its parent", () => {
  const root = mount()
  try {
    const analog = root.renderer.findByTestId("browser-entry-instruments-analog")
    if (!analog) throw new Error("Missing Analog")
    root.renderer.nativeSimulateKeystrokes(analog.id, "enter")
    const child = root.renderer.findByTestId("browser-entry-instruments-analog-1")
    if (!child) throw new Error("Enter did not expand device")
    root.renderer.nativeSimulateKeystrokes(analog.id, "right")
    expect(root.renderer.getFocusedElementId()).toBe(child.id)
    root.renderer.nativeSimulateKeystrokes(child.id, "left")
    expect(root.renderer.getFocusedElementId()).toBe(analog.id)
    root.renderer.nativeSimulateKeystrokes(analog.id, "left")
    expect(root.renderer.findByTestId("browser-entry-instruments-analog-1")).toBeUndefined()
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("Space on a focused browser source controls playback without selecting that source", () => {
  const root = mount()
  try {
    const source = root.renderer.findByTestId("browser-source-instruments")
    if (!source) throw new Error("Missing source")
    root.renderer.nativeSimulateKeystrokes(source.id, "space")
    expect(useProjectState.getState().session.playing).toBe(true)
    expect(root.renderer.findByTestId("browser-entry-samples-Piano C3.wav")).toBeDefined()
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("Space in the browser search edits text and never starts playback", () => {
  const root = mount()
  try {
    const search = root.renderer.findByTestId("browser-search")
    if (!search) throw new Error("Missing search")
    root.renderer.nativeSimulateKeystrokes(search.id, "a space b")
    expect(useProjectState.getState().session.playing).toBe(false)
    expect(root.renderer.getElement(search.id)?.customProps?.value).toBe("a b")
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("empty search results expose reset and restore the unfiltered catalog", () => {
  const root = mount()
  try {
    const search = root.renderer.findByTestId("browser-search")
    if (!search) throw new Error("Missing search")
    root.renderer.nativeSimulateKeystrokes(search.id, "z z z z z z")
    expect(root.renderer.getPaintedText().join(" ")).toContain(englishBrowserLabels.empty)
    const reset = root.renderer.findByTestId("browser-reset-filters")
    if (!reset) throw new Error("Missing reset command")
    root.renderer.nativeSimulateKeystrokes(reset.id, "enter")
    expect(root.renderer.findByTestId("browser-entry-instruments-analog")).toBeDefined()
    expect(root.renderer.findByTestId("browser-reset-filters")).toBeUndefined()
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("scrolling moves resources through a fixed viewport without expanding or remounting it", () => {
  const root = mount()
  try {
    root.renderer.flush()
    const results = root.renderer.findByTestId("browser-results")
    if (!results) throw new Error("Missing resource viewport")
    const before = root.renderer.getElementBounds(results.id)
    const retained = root.renderer.getRetainedElementCount()
    const first = root.renderer.findByTestId("browser-entry-tunings-12-TET")
    const last = root.renderer.findByTestId("browser-entry-instruments-wavetable")
    const firstBefore = first ? root.renderer.getElementBounds(first.id) : null
    const lastBefore = last ? root.renderer.getElementBounds(last.id) : null
    if (!before || !first || !last || !firstBefore || !lastBefore)
      throw new Error("Missing row geometry")
    expect(firstBefore.y).toBeGreaterThanOrEqual(before.y)
    expect(lastBefore.y).toBeGreaterThan(before.y + before.height)
    root.renderer.scrollTo(results.id, 0, -10000)
    root.renderer.flush()
    const firstAfter = root.renderer.getElementBounds(first.id)
    const lastAfter = root.renderer.getElementBounds(last.id)
    if (!firstAfter || !lastAfter) throw new Error("Missing scrolled rows")
    expect(lastAfter.y + lastAfter.height).toBeLessThanOrEqual(before.y + before.height)
    expect(firstAfter.y + firstAfter.height).toBeLessThan(before.y)
    expect(root.renderer.getElementBounds(results.id)).toEqual(before)
    expect(root.renderer.getRetainedElementCount()).toBe(retained)
  } finally {
    root.unmount()
    projectActions.stop()
  }
})

test("narrow Browser results and right-side actions stay inside the resizable panel", () => {
  const root = createTestRoot({ width: 240, height: 640 })
  try {
    root.render(
      <ThemeProvider>
        <BrowserPanel labels={englishBrowserLabels} />
      </ThemeProvider>
    )
    root.renderer.dispatchNativeEvents()
    root.renderer.flush()
    const results = root.renderer.findByTestId("browser-results")
    const row = root.renderer.findByTestId("browser-entry-tunings-12-TET")
    const resultsBounds = results ? root.renderer.getElementBounds(results.id) : null
    const rowBounds = row ? root.renderer.getElementBounds(row.id) : null
    if (!resultsBounds || !rowBounds) throw new Error("Missing narrow Browser bounds")
    expect(resultsBounds.x + resultsBounds.width).toBeLessThanOrEqual(240)
    expect(rowBounds.x + rowBounds.width).toBeLessThanOrEqual(240)
  } finally {
    root.unmount()
  }
})

test("favorite action changes its collection without selecting the resource row", () => {
  const root = mount()
  try {
    const row = root.renderer.findByTestId("browser-entry-tunings-12-TET")
    const favorite = root.renderer.findByTestId("browser-favorite-tunings-12-TET")
    const bounds = favorite ? root.renderer.getElementBounds(favorite.id) : null
    if (!row || !favorite || !bounds) throw new Error("Missing favorite action")
    const background = root.renderer.getElement(row.id)?.style.backgroundColor
    root.renderer.nativeSimulateMouseMove(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    root.renderer.nativeSimulateMouseExit(-1, -1)
    expect(root.renderer.getElement(favorite.id)?.style.opacity).toBe(1)
    expect(root.renderer.getElement(row.id)?.style.backgroundColor).toBe(background)
  } finally {
    root.unmount()
  }
})
