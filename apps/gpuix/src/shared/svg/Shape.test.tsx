import { describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { polygonPath } from "./paths"
import { Shape, shapeMarkup } from "./Shape"

const triangle = polygonPath([
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 1, y: 1 },
])

describe("shapeMarkup", () => {
  test("a filled path is tinted by currentColor and never carries a colour literal", () => {
    const markup = shapeMarkup([{ d: triangle, fill: true }], [], "0 0 2 1")
    expect(markup).toContain('fill="currentColor"')
    expect(markup).toContain(`d="${triangle}"`)
    expect(markup).not.toMatch(/#[0-9a-f]{3,}|rgb|black/i)
  })

  test("a stroked path defaults to a one-pixel round line", () => {
    const markup = shapeMarkup([{ d: "M0,0L1,1" }], [], "0 0 1 1")
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('stroke-width="1"')
    expect(markup).toContain('fill="none"')
  })

  test("an explicit stroke width reaches the markup and differs from the default", () => {
    const thick = shapeMarkup([{ d: "M0,0L1,1", strokeWidth: 3 }], [], "0 0 1 1")
    expect(thick).toContain('stroke-width="3"')
    expect(thick).not.toBe(shapeMarkup([{ d: "M0,0L1,1" }], [], "0 0 1 1"))
  })

  test("circles are emitted after paths", () => {
    const markup = shapeMarkup([{ d: "M0,0L1,1" }], [{ cx: 5, cy: 6, r: 3 }], "0 0 10 10")
    expect(markup.indexOf("<path")).toBeLessThan(markup.indexOf("<circle"))
    expect(markup).toContain('cx="5"')
  })
})

describe("Shape", () => {
  test("renders one svg at the requested size", () => {
    const root = createTestRoot({ width: 80, height: 40 })
    root.render(
      <Shape
        width={14}
        height={7}
        paths={[{ d: triangle, fill: true }]}
        viewBox="0 0 2 1"
        color="#fff"
      />
    )
    root.renderer.flush()
    const [node] = root.renderer.findByType("svg")
    const bounds = root.renderer.getElementBounds(node.id)
    expect(bounds?.width).toBe(14)
    expect(bounds?.height).toBe(7)
    root.unmount()
  })
})
