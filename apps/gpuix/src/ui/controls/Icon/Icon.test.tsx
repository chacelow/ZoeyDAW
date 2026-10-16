import { describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { icons } from "lucide"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"

import { Icon, iconMarkup } from "./index"

describe("iconMarkup", () => {
  test("serialises every path of the lucide node and keeps currentColor", () => {
    const markup = iconMarkup("ChevronsUpDown", 2)
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
    const markup = iconMarkup("Metronome", 2)
    expect(markup.startsWith("<svg")).toBe(true)
    expect(markup).toContain("currentColor")
    expect(iconMarkup("Metronome", 2)).toBe(markup)
  })

  test("filled lucide icons paint the interior while outlines stay hollow", () => {
    expect(iconMarkup("Play", 2, true)).toContain('fill="currentColor"')
    expect(iconMarkup("Play", 2, false)).toContain('fill="none"')
    expect(iconMarkup("Play", 2, true)).not.toBe(iconMarkup("Play", 2, false))
  })

  test("filled Phosphor icons use the package's fill asset", () => {
    expect(iconMarkup("Metronome", 2, true)).not.toBe(iconMarkup("Metronome", 2, false))
    expect(iconMarkup("Metronome", 2, true)).toContain("currentColor")
  })

  test("an unknown name fails loudly instead of drawing an empty glyph", () => {
    expect(() => Reflect.apply(iconMarkup, undefined, ["NotARealIcon", 2])).toThrow(RangeError)
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
    const bounds = root.renderer.getElementBounds(node.id)
    expect(bounds).not.toBeNull()
    expect(bounds?.width).toBe(bounds?.height)
    expect(bounds?.width).toBe(10)
    root.unmount()
  })
})
