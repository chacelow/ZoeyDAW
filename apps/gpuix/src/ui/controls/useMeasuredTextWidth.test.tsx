import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { readOuterBounds, useMeasuredTextWidth } from "./useMeasuredTextWidth"

const samples = ["20", "300", "120.25"]

test("sample layout is measured once, cached by font and strings, and never follows live digits", () => {
  const root = createTestRoot({ width: 480, height: 240 })
  const observations: number[] = []
  let finalWidth = 0
  let ready = false
  function Harness({ value }: { readonly value: string }) {
    const measurement = useMeasuredTextWidth(samples, { fontFamily: "Menlo", fontSize: 13 })
    finalWidth = measurement.width
    ready = measurement.measured
    observations.push(measurement.width)
    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "start",
        }}
      >
        {measurement.sampleNodes}
        {samples.map(sample => (
          <text
            testId={sample}
            key={sample}
            style={{ fontFamily: "Menlo", fontSize: 13, whiteSpace: "nowrap" }}
          >
            {sample}
          </text>
        ))}
        <text style={{ width: measurement.width }}>{value}</text>
      </div>
    )
  }
  root.render(<Harness value="20" />)
  root.renderer.flush()
  root.renderer.dispatchNativeEvents()
  root.renderer.flush()
  expect(ready).toBe(true)
  for (const sample of samples) {
    const actual = readOuterBounds(
      root.renderer,
      root.renderer.getElement(root.renderer.findByTestId(sample)!.id)
    )!
    expect(finalWidth).toBeGreaterThanOrEqual(actual.width)
  }
  const stableWidth = finalWidth
  root.render(<Harness value="300" />)
  root.renderer.flush()
  root.render(<Harness value="120.25" />)
  root.renderer.flush()
  expect(finalWidth).toBe(stableWidth)
  expect(new Set(observations).size).toBeLessThanOrEqual(2)
  root.unmount()
  const cached = createTestRoot({ width: 480, height: 240 })
  cached.render(<Harness value="20" />)
  cached.renderer.flush()
  expect(ready).toBe(true)
  expect(finalWidth).toBe(stableWidth)
  cached.unmount()
})
