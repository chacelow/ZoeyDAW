import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { IconSlot } from "."
import { readOuterBounds } from "../useMeasuredTextWidth"

test("icon slot stays within button bounds and leaves the icon hit transparent", () => {
  const root = createTestRoot({ width: 320, height: 160 })
  let clicks = 0
  root.render(
    <ThemeProvider>
      <Button
        testId="button"
        label="Play"
        iconOnly
        onClick={() => {
          clicks++
        }}
      >
        <IconSlot testId="icon">
          <svg
            aria-hidden="true"
            source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 5L1 9Z"/></svg>'
            style={{ width: 10, height: 10 }}
          />
        </IconSlot>
      </Button>
    </ThemeProvider>
  )
  root.renderer.flush()
  const outer = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("button")!.id)
  )!
  const inner = readOuterBounds(
    root.renderer,
    root.renderer.getElement(root.renderer.findByTestId("icon")!.id)
  )!
  expect(inner.width).toBeLessThanOrEqual(outer.width)
  expect(inner.height).toBeLessThanOrEqual(outer.height)
  root.renderer.nativeSimulateClick(inner.x + inner.width / 2, inner.y + inner.height / 2)
  expect(clicks).toBe(1)
  root.unmount()
})
