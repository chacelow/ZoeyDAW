import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { TruncatedText } from "."
import { Button } from "../Button"
import { ListRow } from "../ListRow"

for (const truncated of [false, true])
  test(`TruncatedText ${truncated ? "shows" : "does not show"} a hover tooltip`, () => {
    const root = createTestRoot({ width: 480, height: 200 })
    try {
      root.render(
        <ThemeProvider>
          <div style={{ display: "flex", width: 400 }}>
            <TruncatedText testId="label" width={72}>
              {truncated ? "A long device name that cannot fit inside four control units" : "Short"}
            </TruncatedText>
          </div>
        </ThemeProvider>
      )
      for (let frame = 0; frame < 4; frame++) {
        root.renderer.flush()
        root.renderer.dispatchNativeEvents()
      }
      const label = root.renderer.findByTestId("label")!
      const bounds = root.renderer.getElementBounds(label.id)!
      expect(bounds.width).toBe(75)
      root.renderer.nativeSimulateMouseMove(400, 150)
      root.renderer.nativeSimulateMouseMove(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
      )
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      expect(root.renderer.findByTestId("label-tooltip") !== undefined).toBe(truncated)
    } finally {
      root.unmount()
    }
  })

test("truncated control labels preserve their parent pointer activation", () => {
  const root = createTestRoot({ width: 480, height: 200 })
  let activations = 0
  try {
    root.render(
      <ThemeProvider>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
          <Button
            testId="button"
            style={{ width: 60 }}
            onClick={() => {
              activations++
            }}
          >
            A very long button label that must be truncated
          </Button>
          <ListRow
            testId="row"
            label="A very long row label that must also be truncated"
            onClick={() => {
              activations++
            }}
          />
        </div>
      </ThemeProvider>
    )
    for (let frame = 0; frame < 4; frame++) {
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    for (const id of ["button", "row"]) {
      const box = root.renderer.getElementBounds(root.renderer.findByTestId(id)!.id)!
      root.renderer.nativeSimulateMouseMove(400, 150)
      root.renderer.nativeSimulateMouseMove(box.x + box.width / 2, box.y + box.height / 2)
      root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
    }
    expect(activations).toBe(2)
  } finally {
    root.unmount()
  }
})
