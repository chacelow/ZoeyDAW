import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ScrollArea } from "./index"

test("bounded native scrolling moves overflowing content without expanding the viewport", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <ScrollArea testId="scroll" size={{ width: 200, height: 100 }}>
        <div testId="content" style={{ height: 400, flexShrink: 0 }}>
          Long content
        </div>
      </ScrollArea>
    </ThemeProvider>
  )
  root.renderer.flush()
  const scroll = root.renderer.findByTestId("scroll")
  if (!scroll) throw new Error("Scroll area missing")
  expect(root.renderer.getElementBounds(scroll.id)).toMatchObject({
    width: 200,
    height: 100,
  })
  root.renderer.nativeSimulateScrollWheel(50, 50, 0, -80)
  root.renderer.flush()
  expect(root.renderer.getScrollOffset(scroll.id)?.[1]).toBeLessThan(0)
  expect(root.renderer.getElementBounds(scroll.id)?.height).toBe(100)
  root.unmount()
})

test("both-axis scrolling and fill remain bounded by explicit native dimensions", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <div style={{ width: 200, height: 100 }}>
        <ScrollArea testId="scroll" fill orientation="both">
          <div style={{ width: 500, height: 400, flexShrink: 0 }}>Wide content</div>
        </ScrollArea>
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  const scroll = root.renderer.findByTestId("scroll")
  if (!scroll) throw new Error("Scroll area missing")
  expect(root.renderer.getElementBounds(scroll.id)).toMatchObject({
    width: 200,
    height: 100,
  })
  root.renderer.scrollTo(scroll.id, -60, -70)
  expect(root.renderer.getScrollOffset(scroll.id)).toEqual([-60, -70])
  root.unmount()
})
