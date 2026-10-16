import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Progress } from "./index"

test("progress clamps values and invalid maxima into a finite track width", () => {
  const root = createTestRoot({ width: 300, height: 150 })
  const cases = [
    { value: -20, max: 100, width: 0 },
    { value: 25, max: 50, width: 100 },
    { value: 200, max: 100, width: 200 },
    { value: Number.POSITIVE_INFINITY, max: 100, width: 200 },
    { value: 25, max: 0, width: 50 },
    { value: 25, max: -10, width: 50 },
    { value: 25, max: Number.NaN, width: 50 },
    { value: 25, max: Number.POSITIVE_INFINITY, width: 50 },
    { value: null, max: 100, width: 60 },
    { value: Number.NaN, max: 100, width: 60 },
  ]
  for (const item of cases) {
    const valueText = item.width === 60 ? "处理中" : `已完成 ${item.width / 2}`
    root.render(
      <ThemeProvider>
        <Progress
          testId="progress"
          value={item.value}
          max={item.max}
          aria-valuetext={valueText}
          style={{ width: 200 }}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const indicator = root.renderer.findByTestId("progress-indicator")
    if (!indicator) throw new Error("Progress indicator missing")
    expect(root.renderer.getElementBounds(indicator.id)?.width).toBeCloseTo(item.width, 0)
    expect(
      Object.values(root.renderer.getA11yTree().nodes ?? {}).some(
        node => node.aria?.role === "ProgressIndicator" && node.aria.value === valueText
      )
    ).toBe(true)
  }
  root.unmount()
})
