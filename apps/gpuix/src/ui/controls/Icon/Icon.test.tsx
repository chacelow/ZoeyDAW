import { describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { icons } from "lucide"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { Icon, iconMarkup } from "./index"

describe("iconMarkup", () => {
  test("serialises every path of the lucide node and keeps currentColor", () => {
    const markup = iconMarkup("ChevronsUpDown")
    for (const [, attributes] of icons.ChevronsUpDown) {
      expect(markup).toContain(`d="${attributes.d}"`)
    }
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('viewBox="0 0 24 24"')
  })

  test("stroke width changes the markup and results are cached per width", () => {
    expect(iconMarkup("Play", 1.5)).toContain('stroke-width="1.5"')
    expect(iconMarkup("Play", 1.5)).toBe(iconMarkup("Play", 1.5))
    expect(iconMarkup("Play", 1.5)).not.toBe(iconMarkup("Play", 2))
  })

  test("a Phosphor glyph comes from the package asset, tinted by currentColor", () => {
    const markup = iconMarkup("Metronome")
    expect(markup.startsWith("<svg")).toBe(true)
    expect(markup).toContain("currentColor")
    expect(iconMarkup("Metronome")).toBe(markup)
  })

  test("an unknown name fails loudly instead of drawing an empty glyph", () => {
    expect(() => iconMarkup("NotARealIcon" as never)).toThrow(RangeError)
  })
})

describe("Icon", () => {
  test("renders one square svg at the shared control icon size", () => {
    const root = createTestRoot({ width: 100, height: 60 })
    root.render(
      <ThemeProvider>
        <div data-testid="host" style={{ display: "flex", alignItems: "start" }}>
          <Icon name="Play" />
        </div>
      </ThemeProvider>
    )
    root.renderer.flush()
    expect(root.renderer.findByType("svg")).toHaveLength(1)
    const [node] = root.renderer.findByType("svg")
    const bounds = readOuterBounds(root.renderer, root.renderer.getElement(node.id))
    expect(bounds).not.toBeNull()
    expect(bounds?.width).toBe(bounds?.height)
    expect(bounds?.width).toBe(10)
    root.unmount()
  })
})
