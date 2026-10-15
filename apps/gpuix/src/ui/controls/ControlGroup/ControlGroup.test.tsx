import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { ControlGroup } from "."

test("group separators do not overlap adjacent button hit targets", () => {
  const root = createTestRoot({ width: 320, height: 160 })
  const selected: string[] = []
  root.render(
    <ThemeProvider>
      <ControlGroup separator="line">
        <Button
          testId="left"
          onClick={() => {
            selected.push("left")
          }}
        >
          Left
        </Button>
        <Button
          testId="right"
          onClick={() => {
            selected.push("right")
          }}
        >
          Right
        </Button>
      </ControlGroup>
    </ThemeProvider>
  )
  root.renderer.flush()
  const left = root.renderer.getElementBounds(root.renderer.findByTestId("left")!.id)!
  const right = root.renderer.getElementBounds(root.renderer.findByTestId("right")!.id)!
  expect(left.x + left.width).toBeLessThanOrEqual(right.x)
  root.renderer.nativeSimulateClick(left.x + left.width - 1, left.y + left.height / 2)
  root.renderer.nativeSimulateClick(right.x + 1, right.y + right.height / 2)
  expect(selected).toEqual(["left", "right"])
  root.unmount()
})
