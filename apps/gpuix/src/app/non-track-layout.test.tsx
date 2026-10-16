import { beforeAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { GalleryCard } from "@/gallery/GalleryCard"
import { GalleryProjectCards } from "@/gallery/GalleryExamples"
import { StateGallery } from "@/gallery/states"
import { createMemorySnapshotStorage } from "@/project/adapters"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DEFAULT_LAYOUT_TOKENS } from "@/shared/theme/layout-tokens"
import { LoadErrorScreen } from "@/ui/controls/LoadErrorScreen"
import { HomePage } from "./home/HomePage"
import { saveRecentProjects } from "./home/recent-projects"
import { initAppI18n } from "./i18n"
import { AppInteractionProvider } from "./interaction"
import { createRouter, RouterProvider } from "./router/router"
import { UnsavedCloseDialog } from "./window/UnsavedCloseDialog"

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
  if (!box) throw new Error(`Missing non-track layout bounds: ${testId}`)
  return box
}

test("feedback maxWidth constrains native error description independently of track geometry", () => {
  const root = createTestRoot({ width: 700, height: 400 })
  try {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          feedback: { ...DEFAULT_DESIGN_TOKENS.feedback, maxWidth: 181 },
        }}
      >
        <LoadErrorScreen
          testId="feedback"
          title="Load failure"
          description={"A detailed failure description. ".repeat(12)}
        />
      </ThemeProvider>
    )
    paint(root)
    expect(bounds(root, "feedback-description").width).toBe(181)
  } finally {
    root.unmount()
  }
})

test("confirmation width changes native content without losing horizontal centering", () => {
  const root = createTestRoot({ width: 900, height: 600 })
  try {
    for (const confirmationWidth of [420, 260]) {
      root.render(
        <ThemeProvider
          design={{
            ...DEFAULT_DESIGN_TOKENS,
            dialog: { ...DEFAULT_DESIGN_TOKENS.dialog, confirmationWidth },
          }}
        >
          <AppInteractionProvider>
            <UnsavedCloseDialog open onChoose={() => {}} />
          </AppInteractionProvider>
        </ThemeProvider>
      )
      paint(root)
      const content = bounds(root, "unsaved-close-content")
      expect(content.width).toBe(confirmationWidth)
      expect(content.x).toBeCloseTo((900 - confirmationWidth) / 2, 0)
    }
  } finally {
    root.unmount()
  }
})

test("recent project card width follows home layout rather than track controls", () => {
  const root = createTestRoot({ width: 1100, height: 500 })
  const storage = createMemorySnapshotStorage()
  saveRecentProjects(storage, [{ id: "width", name: "Project width fixture", openedAt: 0 }])
  try {
    root.render(
      <ThemeProvider
        layout={{
          ...DEFAULT_LAYOUT_TOKENS,
          home: { ...DEFAULT_LAYOUT_TOKENS.home, recentCardWidth: 237 },
        }}
      >
        <RouterProvider value={createRouter("/")}>
          <div style={{ display: "flex", flexDirection: "column", width: 1100, height: 500 }}>
            <HomePage storage={storage} />
          </div>
        </RouterProvider>
      </ThemeProvider>
    )
    paint(root)
    expect(bounds(root, "recent-width").width).toBe(237)
  } finally {
    root.unmount()
  }
})

test("Gallery card source keeps control and project examples at the same native width", () => {
  const root = createTestRoot({ width: 900, height: 500 })
  try {
    root.render(
      <ThemeProvider
        layout={{
          ...DEFAULT_LAYOUT_TOKENS,
          gallery: { ...DEFAULT_LAYOUT_TOKENS.gallery, cardWidth: 233 },
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <GalleryCard testId="width-card" title="Control example" toggleLabel="Toggle example">
            <div style={{ height: 20 }} />
          </GalleryCard>
          <GalleryProjectCards locale="en" onAction={() => {}} />
        </div>
      </ThemeProvider>
    )
    paint(root)
    expect(bounds(root, "width-card").width).toBe(233)
    expect(bounds(root, "gallery-project-section").width).toBe(233)
    expect(bounds(root, "gallery-project-card").width).toBe(233)
  } finally {
    root.unmount()
  }
})

test("Gallery settings preview width follows its own layout after native activation", () => {
  const root = createTestRoot({ width: 1400, height: 1200 })
  try {
    root.render(
      <ThemeProvider
        layout={{
          ...DEFAULT_LAYOUT_TOKENS,
          gallery: { ...DEFAULT_LAYOUT_TOKENS.gallery, settingsPreviewWidth: 487 },
        }}
      >
        <StateGallery locale="en" toolbar={null} />
      </ThemeProvider>
    )
    paint(root)
    const trigger = root.renderer.findByTestId("gallery-open-settings")
    if (!trigger) throw new Error("Missing Gallery settings trigger")
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    paint(root)
    expect(bounds(root, "gallery-settings-preview").width).toBe(487)
  } finally {
    root.unmount()
  }
})

for (const [field, value] of [
  ["gap", 31],
  ["inset", 37],
  ["actionGap", 39],
] as const) {
  test(`feedback ${field} changes native error layout`, () => {
    const output = mkdtempSync(path.join(tmpdir(), "configuration-feedback-"))
    const image = path.join(output, "frame.png")
    const root = createTestRoot({ width: 320, height: 420 })
    const baseline = {
      ...DEFAULT_DESIGN_TOKENS,
      feedback: { ...DEFAULT_DESIGN_TOKENS.feedback, maxWidth: 1000 },
    }
    const render = (changed: boolean) => {
      const design = changed
        ? { ...baseline, feedback: { ...baseline.feedback, [field]: value } }
        : baseline
      root.render(
        <ThemeProvider design={design}>
          <LoadErrorScreen
            title={"The media asset cannot be loaded. ".repeat(3)}
            description={"A detailed failure description. ".repeat(12)}
            onRetry={() => {}}
            retryLabel="Retry loading"
            onSecondary={() => {}}
            secondaryLabel="Return home"
          />
        </ThemeProvider>
      )
      paint(root)
      root.renderer.captureScreenshot(image)
      return readFileSync(image)
    }
    try {
      root.renderer.clockPause()
      const original = render(false)
      expect(render(true).equals(original)).toBe(false)
      expect(render(false).equals(original)).toBe(true)
    } finally {
      root.unmount()
      rmSync(output, { recursive: true, force: true })
    }
  })
}
