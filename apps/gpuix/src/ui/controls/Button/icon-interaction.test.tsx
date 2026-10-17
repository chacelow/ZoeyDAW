import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Button } from "."
import { Icon } from "../Icon"
import { IconSlot } from "../IconSlot"
import { ToolbarIconButton } from "../ToolbarIconButton"

test("icon buttons stay frameless, scale centred glyphs on the GPU and fill only when active or pressed", () => {
  const root = createTestRoot({ width: 500, height: 200 })
  let glyphSize = 0
  let growth = 0
  let borderWidth = 0
  function Fixture() {
    const theme = useTheme()
    glyphSize = theme.control["--spacing-control-icon"]
    growth = theme.design.icon.hoverGrowth
    borderWidth = theme.design.shape.controlBorderWidth
    return <div style={{ display: "flex" }}>
      <Button testId="default" iconOnly activeFilled label="Play" icon={<Icon name="Play" />} />
      <Button testId="ghost" iconOnly variant="ghost" label="Play"><IconSlot><Icon name="Play" /></IconSlot></Button>
      <Button testId="outline" iconOnly variant="outline" label="Play" icon={<Icon name="Play" />} />
      <ToolbarIconButton testId="toolbar" active activeFilled label="Play" icon={<Icon name="Play" />} />
    </div>
  }
  try {
    root.render(<ThemeProvider><Fixture /></ThemeProvider>)
    root.renderer.flush()
    for (const id of ["default", "ghost", "toolbar"]) expect(root.renderer.findByTestId(id)!.style.borderWidth, id).toBe(0)
    expect(root.renderer.findByTestId("outline")!.style.borderWidth).toBe(borderWidth)
    const button = root.renderer.findByTestId("default")!
    const svg = root.renderer.findByType("svg")[0]!
    const box = root.renderer.getElementBounds(button.id)!
    const glyph = () => root.renderer.getElementBounds(svg.id)!
    const scale = () => root.renderer.getElement(svg.id)?.style?.scale
    expect(glyph().width).toBe(glyphSize)
    expect(scale()).toBeUndefined()
    root.renderer.nativeSimulateMouseMove(box.x + box.width / 2, box.y + box.height / 2)
    root.renderer.flush()
    expect(scale()).toBe((glyphSize + growth) / glyphSize)
    expect(glyph().width).toBe(glyphSize)
    expect(glyph().height).toBe(glyphSize)
    expect(Math.abs(glyph().x + glyph().width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(glyph().y + glyph().height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(0.5)
    expect(root.renderer.getElement(svg.id)!.customProps?.source).toContain('fill="none"')
    root.renderer.nativeSimulateMouseDown(box.x + box.width / 2, box.y + box.height / 2)
    expect(root.renderer.getElement(svg.id)!.customProps?.source).toContain('fill="currentColor"')
    root.renderer.nativeSimulateMouseUp(box.x + box.width / 2, box.y + box.height / 2)
    expect(root.renderer.getElement(svg.id)!.customProps?.source).toContain('fill="none"')
    const active = root.renderer.findByType("svg")[3]!
    expect(active.customProps?.source).toContain('fill="currentColor"')
  } finally { root.unmount() }
})
