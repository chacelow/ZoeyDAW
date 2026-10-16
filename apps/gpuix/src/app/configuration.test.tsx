import { beforeAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { createMemorySnapshotStorage } from "@/project/adapters"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import type { LayoutTokens } from "@/shared/theme/layout-tokens"
import { PROJECT_METRICS } from "@/shared/theme/metrics/config"
import { HomePage } from "./home/HomePage"
import { initAppI18n } from "./i18n"
import { ProjectLayout } from "./project/ProjectLayout"
import { useProjectShell } from "./project/useProjectShell"
import { createRouter, RouterProvider } from "./router/router"
import { ThemePresetGrid } from "./settings/ThemePresetGrid"
import { ModalDialog } from "./dialog/ModalDialog"
import { AppInteractionProvider } from "./interaction"

beforeAll(() => initAppI18n())

function paint(root: TestRoot) {
  for (let pass = 0; pass < 6; pass++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}

function bounds(root: TestRoot, testId: string) {
  const element = root.renderer.findByTestId(testId)
  const box = element && root.renderer.getElementBounds(element.id)
  if (!box) throw new Error(`Missing layout bounds: ${testId}`)
  return box
}

function ProjectFixture() {
  const shell = useProjectShell()
  return (
    <ProjectLayout
      projectId="Configuration fixture"
      shell={{ ...shell, footerView: "clip", footerCollapsed: false }}
      focusRef={{ current: null }}
      labels={{
        resizeClipEdit: "Resize clip",
        resizeBrowser: "Resize browser",
        browserPanel: "Resources",
        arrangementPanel: "Arrangement",
        footerPanel: "Clip detail",
        activeDescription: "Selected editor",
      }}
      transport={null}
      browser={null}
      arrangement={null}
      footer={<div />}
      status={null}
    />
  )
}

type Panels = LayoutTokens["project"]["panels"]
const panelCases: readonly {
  readonly field: keyof Panels
  readonly value: `${number}%`
  readonly fraction: number
  readonly panel: string
  readonly group: string
  readonly dimension: "width" | "height"
}[] = [
  {
    field: "browserDefaultSize",
    value: "35%",
    fraction: 0.35,
    panel: "browser-panel",
    group: "project-workspace",
    dimension: "width",
  },
  {
    field: "browserMaxSize",
    value: "20%",
    fraction: 0.2,
    panel: "browser-panel",
    group: "project-workspace",
    dimension: "width",
  },
  {
    field: "arrangementMinWidth",
    value: "80%",
    fraction: 0.8,
    panel: "arrangement-panel",
    group: "project-workspace",
    dimension: "width",
  },
  {
    field: "clipDefaultSize",
    value: "30%",
    fraction: 0.3,
    panel: "clip-panel",
    group: "project-main",
    dimension: "height",
  },
  {
    field: "clipMinSize",
    value: "55%",
    fraction: 0.55,
    panel: "clip-panel",
    group: "project-main",
    dimension: "height",
  },
  {
    field: "clipMaxSize",
    value: "25%",
    fraction: 0.25,
    panel: "clip-panel",
    group: "project-main",
    dimension: "height",
  },
]

for (const entry of panelCases) {
  test(`project panel layout source controls native ${entry.field}`, () => {
    const root = createTestRoot({ width: 1500, height: 700 })
    try {
      const layout: LayoutTokens = {
        ...DEFAULT_LAYOUT_TOKENS,
        project: {
          panels: { ...DEFAULT_LAYOUT_TOKENS.project.panels, [entry.field]: entry.value },
        },
      }
      root.render(
        <ThemeProvider layout={layout}>
          <ProjectFixture />
        </ThemeProvider>
      )
      paint(root)
      const available = bounds(root, entry.group)[entry.dimension] - PROJECT_METRICS.panelGap
      expect(bounds(root, entry.panel)[entry.dimension]).toBeCloseTo(available * entry.fraction, 0)
    } finally {
      root.unmount()
    }
  })
}

test("home layout width responds at runtime and stays centered in its viewport", () => {
  const root = createTestRoot({ width: 1200, height: 500 })
  const router = createRouter("/")
  const storage = createMemorySnapshotStorage()
  try {
    for (const maxWidth of [600, 420]) {
      root.render(
        <ThemeProvider
          layout={{ ...DEFAULT_LAYOUT_TOKENS, home: { ...DEFAULT_LAYOUT_TOKENS.home, maxWidth } }}
        >
          <RouterProvider value={router}>
            <div style={{ display: "flex", flexDirection: "column", width: 1200, height: 500 }}>
              <HomePage storage={storage} />
            </div>
          </RouterProvider>
        </ThemeProvider>
      )
      paint(root)
      const home = bounds(root, "home-page")
      expect(home.width).toBe(maxWidth)
      expect(home.x).toBe((1200 - maxWidth) / 2)
    }
  } finally {
    root.unmount()
  }
})

test("preset grid sources independently control columns, swatches and scroll height", () => {
  const root = createTestRoot({ width: 800, height: 500 })
  try {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          settings: {
            ...DEFAULT_DESIGN_TOKENS.settings,
            presetGrid: { columnWidth: 180, swatchHeight: 44, scrollHeight: 160 },
          },
        }}
      >
        <ThemePresetGrid value="default" onValueChange={() => {}} label="Presets" />
      </ThemeProvider>
    )
    paint(root)
    expect(bounds(root, "theme-preset-scroll").height).toBe(160)
    const option = root.renderer.findByTestId("theme-preset-default")
    if (!option) throw new Error("Missing preset option")
    expect(bounds(root, "theme-preset-default").width).toBe(180)
    const swatch = option.children
      .map(id => root.renderer.getElement(id))
      .find(child => child?.style.position === "relative")
    const box = swatch && root.renderer.getElementBounds(swatch.id)
    if (!box) throw new Error("Missing preset swatch bounds")
    expect(box.height).toBe(44)
  } finally {
    root.unmount()
  }
})

test("dialog backdrop recipe updates native dim without moving modal bounds", () => {
  const output = mkdtempSync(path.join(tmpdir(), "configuration-dialog-"))
  const image = path.join(output, "frame.png")
  const root = createTestRoot({ width: 400, height: 200 })
  const render = (dialogBackdrop: number) => {
    root.render(
      <ThemeProvider
        appearance="dark"
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          colorRecipes: { ...DEFAULT_DESIGN_TOKENS.colorRecipes, dialogBackdrop },
        }}
      >
        <AppInteractionProvider>
          <div style={{ width: 400, height: 200, backgroundColor: "black" }}>
            <ModalDialog open onOpenChange={() => {}} label="Recipe dialog" testId="recipe-dialog">
              <div style={{ width: 80, height: 50, backgroundColor: "white" }} />
            </ModalDialog>
          </div>
        </AppInteractionProvider>
      </ThemeProvider>
    )
    paint(root)
  }
  try {
    root.renderer.clockPause()
    render(0)
    const original = bounds(root, "recipe-dialog")
    root.renderer.captureScreenshot(image)
    const transparent = readFileSync(image)
    render(70)
    root.renderer.captureScreenshot(image)
    expect(readFileSync(image).equals(transparent)).toBe(false)
    expect(bounds(root, "recipe-dialog")).toEqual(original)
  } finally {
    root.unmount()
    rmSync(output, { recursive: true, force: true })
  }
})

test("selected preset typography weight changes native text paint without resizing columns", () => {
  const output = mkdtempSync(path.join(tmpdir(), "configuration-preset-"))
  const image = path.join(output, "frame.png")
  const root = createTestRoot({ width: 800, height: 500 })
  const render = (medium: number) => {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          typography: {
            ...DEFAULT_DESIGN_TOKENS.typography,
            weights: { ...DEFAULT_DESIGN_TOKENS.typography.weights, medium },
          },
        }}
      >
        <ThemePresetGrid value="default" onValueChange={() => {}} label="Presets" />
      </ThemeProvider>
    )
    paint(root)
  }
  try {
    root.renderer.clockPause()
    render(100)
    const original = bounds(root, "theme-preset-default")
    root.renderer.captureScreenshot(image)
    const light = readFileSync(image)
    render(900)
    root.renderer.captureScreenshot(image)
    expect(readFileSync(image).equals(light)).toBe(false)
    expect(bounds(root, "theme-preset-default")).toEqual(original)
  } finally {
    root.unmount()
    rmSync(output, { recursive: true, force: true })
  }
})
