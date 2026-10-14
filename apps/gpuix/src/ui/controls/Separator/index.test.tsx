import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Separator } from "./index"

test("horizontal and vertical separators occupy only one pixel on the dividing axis", () => {
  const root = createTestRoot({ width: 300, height: 150 })
  root.render(
    <ThemeProvider>
      <div style={{ display: "flex", flexDirection: "column", width: 200 }}>
        <Separator testId="horizontal" />
        <div style={{ display: "flex", height: 80 }}>
          <Separator testId="vertical" orientation="vertical" />
        </div>
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  const horizontal = root.renderer.findByTestId("horizontal")
  const vertical = root.renderer.findByTestId("vertical")
  if (!horizontal || !vertical) throw new Error("Separators missing")
  expect(readOuterBounds(root.renderer, root.renderer.getElement(horizontal.id))).toMatchObject({
    width: 200,
    height: 1,
  })
  expect(readOuterBounds(root.renderer, root.renderer.getElement(vertical.id))).toMatchObject({
    width: 1,
    height: 80,
  })
  root.render(
    <ThemeProvider>
      <Separator decorative />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(
    Object.values(root.renderer.getA11yTree().nodes ?? {}).some(
      node => node.aria?.role === "Separator"
    )
  ).toBe(false)
  root.unmount()
})
