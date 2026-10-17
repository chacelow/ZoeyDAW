import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ElementBounds } from "@gpuix/native/host"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { THEME_PRESETS } from "@/shared/theme/presets"
import {
  Button,
  Input,
  ControlGroup,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DragPadNumber,
  ScrollArea,
  ControlEnvironmentProvider,
} from "@/ui/controls"
import {
  ThemeEditor,
  activeCustomTheme,
  duplicateCurrentTheme,
  EMPTY_THEME_LIBRARY,
  resolveThemeOverrides,
  setThemeField,
  updateCustomTheme,
} from "@/app/theme-editor"
import { themeEditorTranslation } from "@/app/locales/theme-editor"
import { TEST_INPUT_POLICY } from "@/ui/controls/DragPad/input-policy.test-fixture"
import { GalleryDemo } from "./GalleryDemo"
import { createGalleryWorkspaceLayout } from "./states"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})
function painted(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  const box = node && root.renderer.getElementBounds(node.id)
  if (!node || !box) throw new Error(`Missing painted ${testId}`)
  return { node, box }
}
function click(root: TestRoot, testId: string) {
  root.renderer.scrollIntoView(painted(root, testId).node.id)
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.nativeSimulateKeystrokes(painted(root, testId).node.id, "enter")
}

test("gallery workspace opens categories, preview, and theme in left-to-right dock groups", () => {
  const layout = createGalleryWorkspaceLayout()
  expect(layout.root?.kind).toBe("split")
  if (layout.root?.kind !== "split") throw new Error("Expected gallery split")
  expect(layout.root.children.map(child => child.id)).toEqual(["categories", "preview", "theme"])
  expect(layout.root.sizes[1]).toBeGreaterThan(layout.root.sizes[0] ?? 0)
})

test("gallery category selection changes the real preview and theme controls update appearance", async () => {
  const root = createTestRoot({ width: 1400, height: 900 })
  roots.push(root)
  async function settle() {
    for (let index = 0; index < 4; index++) {
      await Bun.sleep(35)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
  }
  root.render(<GalleryDemo />)
  await settle()
  const categories = painted(root, "gallery-categories").box
  const preview = painted(root, "gallery-body-scroll").box
  const panel = painted(root, "gallery-theme-panel").box
  expect(categories.x).toBeLessThan(preview.x)
  expect(preview.x).toBeLessThan(panel.x)
  expect(preview.width).toBeGreaterThan(categories.width)
  expect(preview.width).toBeGreaterThan(panel.width)
  const firstPreset = painted(root, `theme-preset-${THEME_PRESETS[0]?.id}`).box
  const secondPreset = painted(root, `theme-preset-${THEME_PRESETS[1]?.id}`).box
  expect(secondPreset.y).toBe(firstPreset.y)
  expect(secondPreset.x).toBeGreaterThan(firstPreset.x)
  const presetGrid = painted(root, "theme-preset-grid").box
  expect(presetGrid.x - panel.x).toBeCloseTo(DEFAULT_DESIGN_TOKENS.dock.contentInset)
  expect(panel.x + panel.width - presetGrid.x - presetGrid.width).toBeCloseTo(
    DEFAULT_DESIGN_TOKENS.dock.contentInset
  )
  const lastColumn = painted(root, "gallery-section-buttons-column-3").box
  expect(lastColumn.width).toBe(painted(root, "gallery-button").box.width)
  expect(lastColumn.width).toBeGreaterThan(
    (DEFAULT_DESIGN_TOKENS.grid.buttonWidthUnits * DEFAULT_DESIGN_TOKENS.dock.stripHeight) / 2
  )
  expect(painted(root, "gallery-grid-1").node.customProps?.["aria-label"]).toBe("1u")
  expect(painted(root, "gallery-language-en").box.width).toBeGreaterThan(
    (DEFAULT_DESIGN_TOKENS.grid.segmentWidthUnits * DEFAULT_DESIGN_TOKENS.dock.stripHeight) / 2
  )
  const categoryRow = painted(root, "gallery-category-buttons").box
  expect(categoryRow.x).toBeGreaterThan(categories.x)
  expect(categoryRow.width).toBeCloseTo(
    categories.width - DEFAULT_DESIGN_TOKENS.dock.contentInset * 2
  )
  expect(root.renderer.findByTestId("gallery-design-toolbar")).toBeUndefined()
  const section = painted(root, "gallery-section-buttons").node
  expect(section.style?.borderWidth ?? 0).toBe(0)
  expect(
    root.renderer
      .findByTestId("gallery-section-buttons-header")
      ?.children.map(id => root.renderer.getElement(id))
      .some(node => node?.customProps?.role === "button")
  ).toBe(false)
  click(root, "gallery-category-inputs")
  await settle()
  expect(root.renderer.findByTestId("gallery-section-inputs")).toBeDefined()
  expect(root.renderer.findByTestId("gallery-section-buttons")).toBeUndefined()
  expect(painted(root, "gallery-theme-dark").node.customProps?.["aria-pressed"]).toBe(true)
  click(root, "gallery-theme-light")
  await settle()
  expect(painted(root, "gallery-theme-light").node.customProps?.["aria-pressed"]).toBe(true)
  expect(painted(root, "gallery-theme-dark").node.customProps?.["aria-pressed"]).toBe(false)
  expect(root.renderer.findByTestId("gallery-section-inputs")).toBeDefined()
  expect(painted(root, "gallery-language-en").node.customProps?.["aria-pressed"]).toBe(true)
  expect(painted(root, "gallery-language-en").box.y).toBeGreaterThan(
    painted(root, "gallery-theme-light").box.y
  )
  click(root, "gallery-language-zh")
  await settle()
  expect(painted(root, "gallery-language-zh").node.customProps?.["aria-pressed"]).toBe(true)
  expect(root.renderer.findByTestId("gallery-section-inputs")).toBeDefined()
})

test("Gallery Preview scrolls the lower nested layout demo fully into view", async () => {
  const root = createTestRoot({ width: 1045, height: 780 })
  roots.push(root)
  async function settle() {
    for (let frame = 0; frame < 4; frame++) {
      await Bun.sleep(35)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
  }
  root.render(<GalleryDemo />)
  await settle()
  click(root, "gallery-category-layout")
  await settle()
  const mixer = painted(root, "gallery-layouts-mixer-panel")
  const viewport = painted(root, "gallery-body-scroll").box
  root.renderer.nativeSimulateScrollWheel(
    viewport.x + DEFAULT_DESIGN_TOKENS.dock.contentInset * 2,
    viewport.y + viewport.height / 2,
    0,
    viewport.y +
      viewport.height -
      mixer.box.y -
      mixer.box.height -
      DEFAULT_DESIGN_TOKENS.dock.contentInset
  )
  await settle()
  const visibleMixer = painted(root, "gallery-layouts-mixer-panel").box
  expect(visibleMixer.height).toBeGreaterThan(0)
  expect(visibleMixer.y).toBeGreaterThanOrEqual(viewport.y)
  expect(visibleMixer.y + visibleMixer.height).toBeLessThanOrEqual(viewport.y + viewport.height)
})

for (const kind of ["button", "input", "group"] as const) {
  test(`one controlRadius value changes the actual ${kind} raster without moving its geometry`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "design-radius-"))
    const filename = path.join(directory, "frame.png")
    const root = createTestRoot({ width: 180, height: 50 })
    roots.push(root)
    try {
      let previous: { frame: Buffer; box: ElementBounds } | undefined
      for (const radius of [3, 0]) {
        const design = {
          ...DEFAULT_DESIGN_TOKENS,
          shape: { ...DEFAULT_DESIGN_TOKENS.shape, controlRadius: radius },
        }
        root.render(
          <ThemeProvider design={design}>
            {kind === "button" ? (
              <Button testId="shape">Shape</Button>
            ) : kind === "input" ? (
              <Input testId="shape" value="Shape" readOnly style={{ width: 120 }} />
            ) : (
              <ControlGroup testId="shape">
                <text>Shape</text>
              </ControlGroup>
            )}
          </ThemeProvider>
        )
        const { box } = painted(root, "shape")
        root.renderer.captureScreenshot(filename)
        const frame = readFileSync(filename)
        if (previous) {
          expect(frame.equals(previous.frame)).toBe(false)
          expect(box).toEqual(previous.box)
        }
        previous = { frame, box }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

test("theme editor preserves numeric edits while changing real border, radius, spacing and control height", () => {
  const root = createTestRoot({ width: 1100, height: 900 })
  roots.push(root)
  function Preview() {
    const theme = useTheme()
    const [number, setNumber] = useState(120)
    return (
      <div
        style={{ display: "flex", flexDirection: "row", gap: theme.design.spacing.cardGroupGap }}
      >
        <Card size="controls" testId="first-card" style={{ width: 200 }}>
          <DragPadNumber
            testId="preview-number"
            label="Number"
            value={number}
            onChange={setNumber}
            min={0}
            max={999}
            step={1}
          />
          <Button testId="preview-button">Preview</Button>
        </Card>
        <Card size="controls" testId="next-card" style={{ width: 200 }}>
          <Input testId="preview-input" value="Preview" readOnly />
        </Card>
      </div>
    )
  }
  function Harness() {
    const [library, setLibrary] = useState(() => {
      const initial = duplicateCurrentTheme(EMPTY_THEME_LIBRARY, "Test theme")
      return updateCustomTheme(
        initial,
        setThemeField(activeCustomTheme(initial)!, "design.shape.controlRadius", 5)
      )
    })
    return (
      <ThemeProvider {...resolveThemeOverrides(library, "dark")}>
        <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
          <div style={{ display: "flex", flexDirection: "row" }}>
            <ScrollArea
              testId="theme-test-scroll"
              height={900}
              style={{ display: "flex", flexDirection: "column", width: 420, flexShrink: 0 }}
            >
              <ThemeEditor
                value={library}
                onChange={setLibrary}
                t={key => themeEditorTranslation(key, "en")}
              />
            </ScrollArea>
            <Preview />
          </div>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  function editNumber(testId: string, text: string) {
    const target = painted(root, testId)
    const viewport = painted(root, "theme-test-scroll")
    if (target.box.x < viewport.box.x + viewport.box.width) {
      const offset = root.renderer.getScrollOffset(viewport.node.id)?.[1] ?? 0
      const delta =
        target.box.y < viewport.box.y
          ? viewport.box.y - target.box.y
          : Math.min(0, viewport.box.y + viewport.box.height - target.box.y - target.box.height)
      root.renderer.scrollTo(viewport.node.id, 0, offset + delta)
    }
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    const { box } = painted(root, testId)
    root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
    for (const key of text) root.renderer.simulateKeystrokes(key)
    root.renderer.simulateKeystrokes("enter")
  }
  root.render(<Harness />)
  editNumber("preview-number", "240")
  const before = painted(root, "preview-number").box
  click(root, "theme-editor-group-colors")
  click(root, "theme-editor-group-shape")
  const directory = mkdtempSync(path.join(tmpdir(), "theme-editor-raster-"))
  const screenshot = path.join(directory, "preview.png")
  try {
    root.renderer.captureScreenshot(screenshot)
    const rounded = readFileSync(screenshot)
    editNumber("theme-field-design.shape.controlRadius", "0")
    root.renderer.captureScreenshot(screenshot)
    expect(readFileSync(screenshot).equals(rounded)).toBe(false)
    expect(painted(root, "preview-number").box.width).toBe(before.width)
    editNumber("theme-field-design.shape.controlBorderWidth", "0")
    expect(painted(root, "preview-number").node.style.borderWidth).toBe(0)
    expect(painted(root, "preview-number").box.width).toBe(before.width)
    expect(painted(root, "preview-number").node.customProps?.["aria-valuetext"]).toBe("240")
    click(root, "theme-editor-group-shape")
    click(root, "theme-editor-group-spacing")
    const first = painted(root, "first-card").box
    const next = painted(root, "next-card").box
    editNumber(
      "theme-field-design.spacing.cardGroupGap",
      String(DEFAULT_DESIGN_TOKENS.spacing.cardGroupGap * 2)
    )
    const largeFirst = painted(root, "first-card").box
    const largeNext = painted(root, "next-card").box
    expect(largeNext.x - largeFirst.x - largeFirst.width).toBe((next.x - first.x - first.width) * 2)
    click(root, "theme-editor-group-spacing")
    click(root, "theme-editor-group-controls")
    editNumber("theme-field-control.default.--spacing-control-track", "28")
    expect(painted(root, "preview-button").box.height).toBe(28)
    expect(painted(root, "preview-number").node.customProps?.["aria-valuetext"]).toBe("240")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("shared disclosure centers its button and consumes Enter without also activating its Card", () => {
  const windowKeys: string[] = []
  const root = createTestRoot({
    width: 320,
    height: 180,
    onKeyDown: event => {
      if (event.key) windowKeys.push(event.key)
    },
  })
  roots.push(root)
  let cardActivations = 0
  function Example() {
    const [expanded, setExpanded] = useState(true)
    return (
      <ThemeProvider>
        <Card
          testId="card"
          size="controls"
          onClick={() => {
            cardActivations++
          }}
          style={{ width: 300 }}
        >
          <CardHeader
            testId="header"
            disclosure={{ expanded, onExpandedChange: setExpanded, label: "Toggle body" }}
          >
            <CardTitle>Header</CardTitle>
          </CardHeader>
          {expanded ? (
            <CardContent testId="body">
              <text>Body</text>
            </CardContent>
          ) : null}
        </Card>
      </ThemeProvider>
    )
  }
  root.render(<Example />)
  const header = painted(root, "header")
  const toggle = header.node.children
    .map(id => root.renderer.getElement(id))
    .find(node => node?.customProps?.role === "button")
  const box = toggle && root.renderer.getElementBounds(toggle.id)
  if (!toggle || !box) throw new Error("Missing disclosure button")
  expect(
    Math.abs(box.y + box.height / 2 - header.box.y - header.box.height / 2)
  ).toBeLessThanOrEqual(1)
  root.renderer.nativeSimulateKeystrokes(toggle.id, "space")
  expect(root.renderer.findByTestId("body")).toBeDefined()
  expect(cardActivations).toBe(0)
  expect(windowKeys).toContain("space")
  root.renderer.nativeSimulateKeystrokes(toggle.id, "enter")
  expect(root.renderer.findByTestId("body")).toBeUndefined()
  expect(cardActivations).toBe(0)
  root.renderer.nativeSimulateKeystrokes(toggle.id, "enter")
  expect(root.renderer.findByTestId("body")).toBeDefined()
  expect(cardActivations).toBe(0)
  root.renderer.nativeSimulateKeystrokes(painted(root, "card").node.id, "space")
  expect(cardActivations).toBe(1)
})

test("project Card changes a single inset without adding Header or Content padding twice", () => {
  const root = createTestRoot({ width: 340, height: 180 })
  roots.push(root)
  for (const inset of [12, 20]) {
    const design = {
      ...DEFAULT_DESIGN_TOKENS,
      cards: {
        ...DEFAULT_DESIGN_TOKENS.cards,
        project: { ...DEFAULT_DESIGN_TOKENS.cards.project, inset },
      },
    }
    root.render(
      <ThemeProvider design={design}>
        <Card testId="project" size="project" style={{ width: 300 }}>
          <CardHeader>
            <CardTitle testId="title">Project</CardTitle>
          </CardHeader>
          <text testId="direct">Direct content</text>
          <CardContent>
            <text testId="detail">Opened today</text>
          </CardContent>
        </Card>
      </ThemeProvider>
    )
    const card = painted(root, "project").box
    expect(painted(root, "title").box.x - card.x).toBe(inset + design.shape.cardBorderWidth)
    expect(painted(root, "detail").box.x - card.x).toBe(inset + design.shape.cardBorderWidth)
    expect(painted(root, "direct").box.x - card.x).toBe(inset + design.shape.cardBorderWidth)
  }
})
test("one Gallery Popover example switches its side and alignment through real controls", async () => {
  const root = createTestRoot({ width: 1400, height: 1200 })
  roots.push(root)
  async function settle() {
    for (let frame = 0; frame < 4; frame++) {
      await Bun.sleep(35)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
  }
  root.render(<GalleryDemo />)
  await settle()
  click(root, "gallery-category-menus")
  await settle()
  click(root, "gallery-popover-side-bottom")
  click(root, "gallery-popover-align-end")
  await settle()
  expect(painted(root, "gallery-popover-side-bottom").node.customProps?.["aria-pressed"]).toBe(true)
  expect(painted(root, "gallery-popover-align-end").node.customProps?.["aria-pressed"]).toBe(true)
  click(root, "gallery-popover")
  await settle()
  const trigger = painted(root, "gallery-popover").box
  const content = painted(root, "gallery-popover-content").box
  expect(content.y).toBeGreaterThanOrEqual(trigger.y + trigger.height)
  expect(Math.abs(content.x + content.width - trigger.x - trigger.width)).toBeLessThanOrEqual(1)
})
