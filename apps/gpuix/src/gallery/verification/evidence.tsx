import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestElement } from "@gpuix/react/testing"
import { GalleryDemo } from "../GalleryDemo"
import { GALLERY_DESIGNS } from "../design-preview"
import type { GalleryDesignMode } from "../design-preview"
import { captureEvidenceProvenance } from "../evidence-provenance"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : mkdtempSync(path.join(tmpdir(), "zoeydaw-a3-composition-"))
mkdirSync(output, { recursive: true })
const provenance = captureEvidenceProvenance(repository)
const root = createTestRoot({ width: 1050, height: 780 })
const renderer = root.renderer
const errors: { key: string; invariant: string; actual: unknown; expected: unknown }[] = []
const measurements: {
  key: string
  invariant: string
  actual: number
  expected: number
  tolerance: number
  pass: boolean
}[] = []
const captures: unknown[] = []
const operations: unknown[] = []

function flush() {
  for (let frame = 0; frame < 3; frame++) {
    renderer.flush()
    renderer.dispatchNativeEvents()
  }
}
function bounds(testId: string) {
  const node = renderer.findByTestId(testId)
  const box = node && renderer.getElementBounds(node.id)
  if (!node || !box) throw new Error(`Missing painted Gallery node ${testId}`)
  return { node, box }
}
function click(testId: string) {
  const { box } = bounds(testId)
  renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
  flush()
}
function compare(
  key: string,
  invariant: string,
  actual: number,
  expected: number,
  tolerance = 0.02
) {
  const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
  measurements.push({ key, invariant, actual, expected, tolerance, pass })
  if (!pass) errors.push({ key, invariant, actual, expected })
}
function tree() {
  const nodes: TestElement[] = []
  const visit = (id: number) => {
    const node = renderer.getElement(id)
    if (!node) return
    nodes.push(node)
    for (const child of node.children) visit(child)
  }
  const top = renderer.getRoot()
  if (top) visit(top.id)
  return nodes
}
function capture(appearance: "dark" | "light", locale: "en" | "zh", mode: GalleryDesignMode) {
  const key = `${mode}--${appearance}--${locale}`
  const design = GALLERY_DESIGNS[mode]
  const first = bounds("gallery-numeric-card").box
  const second = bounds("gallery-menu-card").box
  compare(key, "Card group gap", second.x - first.x - first.width, design.spacing.cardGroupGap)
  compare(key, "Root inset", first.x, design.spacing.rootInset)
  compare(key, "Card width", first.width, 304)
  for (const [id, height] of [
    ["gallery-button", 13],
    ["gallery-icon", 13],
    ["gallery-number", 13],
    ["gallery-transport-number", 20],
    ["gallery-transport-icon", 20],
  ] satisfies readonly (readonly [string, number])[]) {
    const { node, box } = bounds(id)
    compare(key, `${id} height`, box.height, height)
    compare(
      key,
      `${id} actual border token`,
      Number(node.style.borderWidth),
      design.shape.controlBorderWidth
    )
  }
  for (const id of ["gallery-icon", "gallery-transport-icon"]) {
    const { box } = bounds(id)
    compare(key, `${id} square`, box.width, box.height)
  }
  const number = bounds("gallery-number").box
  const input = bounds("gallery-input").node
  compare(key, "Input inline padding", Number(input.style.paddingLeft), design.input.paddingInline)
  const header = bounds("gallery-numeric-card-header")
  const toggle = tree().find(
    node => node.parentId === header.node.id && node.customProps?.role === "button"
  )
  const toggleBox = toggle && renderer.getElementBounds(toggle.id)
  if (!toggleBox) throw new Error("Missing shared disclosure button")
  compare(
    key,
    "Disclosure vertical center",
    toggleBox.y + toggleBox.height / 2,
    header.box.y + header.box.height / 2,
    1
  )
  const screenshot = `${key}.png`
  renderer.nativeSimulateMouseMove(1049, 779)
  renderer.captureScreenshot(path.join(output, screenshot))
  const metadata = {
    key,
    appearance,
    locale,
    mode,
    design,
    number,
    tree: tree().map(node => ({
      ...node,
      events: [...node.events],
      bounds: renderer.getElementBounds(node.id),
    })),
    a11y: renderer.getA11yTree(),
    nativeFrameStats: renderer.getDebugFrameOverlayStats(),
  }
  writeFileSync(path.join(output, `${key}.json`), `${JSON.stringify(metadata, null, 2)}\n`)
  captures.push({
    key,
    screenshot: path.join(output, screenshot),
    sha256: createHash("sha256")
      .update(readFileSync(path.join(output, screenshot)))
      .digest("hex"),
    metadata: path.join(output, `${key}.json`),
    visualReview:
      "Coordinator must inspect the real combined Gallery; file count and assertions are not visual approval",
  })
  return number.width
}

try {
  renderer.clockPause()
  for (const appearance of ["dark", "light"] as const)
    for (const locale of ["en", "zh"] as const) {
      root.render(
        <GalleryDemo
          key={`${appearance}-${locale}`}
          initialAppearance={appearance}
          initialLocale={locale}
        />
      )
      flush()
      const defaultWidth = capture(appearance, locale, "default")
      if (appearance !== "dark" || locale !== "en") continue
      click("gallery-design-flat")
      const flatWidth = capture(appearance, locale, "flat")
      compare(
        "design-linkage",
        "Numeric width removes actual two borders",
        defaultWidth - flatWidth,
        GALLERY_DESIGNS.default.shape.controlBorderWidth * 2
      )
      click("gallery-design-spacious")
      capture(appearance, locale, "spacious")
      click("gallery-design-default")
      const numeric = bounds("gallery-number")
      renderer.nativeSimulateClick(
        numeric.box.x + numeric.box.width / 2,
        numeric.box.y + numeric.box.height / 2
      )
      for (const key of ["2", "4", "0"]) renderer.simulateKeystrokes(key)
      flush()
      const editor = renderer.findByTestId("gallery-number-value")
      if (
        editor?.type !== "input" ||
        editor.customProps?.value !== "240" ||
        renderer.getFocusedElementId() !== editor.id
      )
        errors.push({
          key: "numeric-edit",
          invariant: "Focused real editor contains typed value",
          actual: editor?.customProps,
          expected: "240",
        })
      compare(
        "numeric-edit",
        "Editing shell width stays stable",
        bounds("gallery-number").box.width,
        numeric.box.width
      )
      renderer.simulateKeystrokes("enter")
      compare(
        "numeric-edit",
        "Enter commits real value",
        Number(bounds("gallery-number").node.customProps?.["aria-valuetext"]),
        240
      )
      compare(
        "numeric-edit",
        "Transport shares actual parameter",
        Number(bounds("gallery-transport-number").node.customProps?.["aria-valuetext"]),
        240
      )
      renderer.nativeSimulateClick(
        numeric.box.x + numeric.box.width / 2,
        numeric.box.y + numeric.box.height / 2
      )
      renderer.simulateKeystrokes("9")
      renderer.simulateKeystrokes("escape")
      compare(
        "numeric-edit",
        "Escape restores pre-edit value",
        Number(bounds("gallery-number").node.customProps?.["aria-valuetext"]),
        240
      )
      const header = bounds("gallery-numeric-card-header")
      const toggle = tree().find(
        node => node.parentId === header.node.id && node.customProps?.role === "button"
      )
      if (!toggle) throw new Error("Disclosure action unavailable")
      const toggleBounds = renderer.getElementBounds(toggle.id)
      if (!toggleBounds) throw new Error("Disclosure has no painted bounds")
      renderer.nativeSimulateClick(
        toggleBounds.x + toggleBounds.width / 2,
        toggleBounds.y + toggleBounds.height / 2
      )
      flush()
      if (renderer.findByTestId("gallery-numeric-card-content"))
        errors.push({
          key: "disclosure",
          invariant: "Collapsed body unmounts",
          actual: "body remains",
          expected: "unmounted",
        })
      compare(
        "disclosure",
        "Collapsed Card has only header and shared insets",
        bounds("gallery-numeric-card").box.height,
        bounds("gallery-numeric-card-header").box.height +
          GALLERY_DESIGNS.default.cards.controls.inset * 2 +
          GALLERY_DESIGNS.default.shape.cardBorderWidth * 2
      )
      const freshHeader = bounds("gallery-numeric-card-header")
      const freshToggle = tree().find(
        node => node.parentId === freshHeader.node.id && node.customProps?.role === "button"
      )
      const freshBox = freshToggle && renderer.getElementBounds(freshToggle.id)
      if (!freshBox) throw new Error("Collapsed disclosure action unavailable")
      renderer.nativeSimulateClick(
        freshBox.x + freshBox.width / 2,
        freshBox.y + freshBox.height / 2
      )
      flush()
      compare(
        "disclosure",
        "Reopen preserves owner parameter",
        Number(bounds("gallery-number").node.customProps?.["aria-valuetext"]),
        240
      )
      const scroll = bounds("gallery-scroll")
      renderer.nativeSimulateScrollWheel(
        scroll.box.x + scroll.box.width / 2,
        scroll.box.y + scroll.box.height / 2,
        0,
        -32
      )
      const offset = renderer.getScrollOffset(scroll.node.id)
      if (!offset || offset[1] >= 0)
        errors.push({
          key: "scroll",
          invariant: "Actual native wheel scrolls region",
          actual: offset,
          expected: "negative y offset",
        })
      operations.push({
        key: "dark-en",
        numericEdit: "240 committed and shared; Escape cancelled next edit",
        disclosure: "closed body unmounted and reopened",
        scrollOffset: offset,
      })
    }
} catch (error) {
  errors.push({
    key: "composition",
    invariant: "Native composition verification completes",
    actual: error instanceof Error ? error.message : String(error),
    expected: "complete",
  })
} finally {
  root.unmount()
  compare("lifecycle", "Retained nodes after unmount", renderer.getRetainedElementCount(), 0)
}
writeFileSync(
  path.join(output, "manifest.json"),
  `${JSON.stringify({ provenance, captures, measurements, operations, errors }, null, 2)}\n`
)
process.stdout.write(`${JSON.stringify({ output, errors, overviews: captures.length })}\n`)
if (errors.length) process.exitCode = 1
