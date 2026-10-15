import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ElementBounds } from "@gpuix/native/host"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import {
  Button,
  Input,
  ControlGroup,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/ui/controls"
import { GalleryDemo } from "./GalleryDemo"

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
  const { box } = painted(root, testId)
  root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
}

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

test("live design previews preserve numeric edits and use real zero-border geometry", () => {
  const root = createTestRoot({ width: 1050, height: 780 })
  roots.push(root)
  root.render(<GalleryDemo />)
  const numeric = painted(root, "gallery-number")
  root.renderer.nativeSimulateClick(
    numeric.box.x + numeric.box.width / 2,
    numeric.box.y + numeric.box.height / 2
  )
  for (const key of ["2", "4", "0"]) root.renderer.simulateKeystrokes(key)
  const editor = painted(root, "gallery-number-value")
  expect(editor.node.type).toBe("input")
  expect(editor.node.customProps?.value).toBe("240")
  expect(root.renderer.getFocusedElementId()).toBe(editor.node.id)
  expect(painted(root, "gallery-number").box.width).toBe(numeric.box.width)
  root.renderer.simulateKeystrokes("enter")
  click(root, "gallery-design-flat")
  expect(painted(root, "gallery-number").node.customProps?.["aria-valuetext"]).toBe("240")
  expect(painted(root, "gallery-transport-number").node.customProps?.["aria-valuetext"]).toBe("240")
  expect(painted(root, "gallery-number").box.width).toBe(
    numeric.box.width - DEFAULT_DESIGN_TOKENS.shape.controlBorderWidth * 2
  )
  const input = painted(root, "gallery-input")
  const shell = painted(root, "gallery-input-shell")
  expect(input.box.width).toBe(shell.box.width)
  const icon = painted(root, "gallery-icon").box
  expect(icon.width).toBe(icon.height)
  const firstCard = painted(root, "gallery-numeric-card").box
  const nextCard = painted(root, "gallery-menu-card").box
  click(root, "gallery-design-spacious")
  const largeFirst = painted(root, "gallery-numeric-card").box
  const largeNext = painted(root, "gallery-menu-card").box
  expect(largeNext.x - largeFirst.x - largeFirst.width).toBe(
    (nextCard.x - firstCard.x - firstCard.width) * 2
  )
  expect(painted(root, "gallery-number").node.customProps?.["aria-valuetext"]).toBe("240")
  const panels = painted(root, "gallery-panel-card").box
  const project = painted(root, "gallery-project-card").box
  expect(project.y).toBeGreaterThan(panels.y + panels.height)
  expect(project.x).toBe(largeFirst.x)
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
