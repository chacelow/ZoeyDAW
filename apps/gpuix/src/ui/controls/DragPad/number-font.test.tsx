import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { DragPadNumber } from "./DragPadNumber"
import type { DragPadNumberProps } from "./DragPadNumber"

type AssertFalse<T extends false> = T
export type NumericPadHasNoVariantAlias = AssertFalse<
  "variant" extends keyof DragPadNumberProps ? true : false
>

test("numeric font token controls measured width, display and editing", async () => {
  const root = createTestRoot({ width: 640, height: 180 })
  let padding = 0
  function Harness() {
    const theme = useTheme()
    padding =
      theme.control["--spacing-control-track-pad"] * 2 + theme.design.shape.controlBorderWidth * 2
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
        <text
          testId="font-reference"
          style={{
            alignSelf: "flex-start",
            fontSize: theme.control["--text-control-track"],
            fontFamily: theme.design.typography.numberFontFamily,
          }}
        >
          WWWWWWWWWW
        </text>
        <DragPadNumber
          testId="font-pad"
          label="Value"
          value={1}
          min={0}
          max={2}
          step={1}
          hideIcon
          format={() => "WWWWWWWWWW"}
          onChange={() => {}}
        />
      </div>
    )
  }
  try {
    root.render(
      <ThemeProvider
        design={{ ...DEFAULT_DESIGN_TOKENS, typography: { numberFontFamily: "Helvetica" } }}
      >
        <Harness />
      </ThemeProvider>
    )
    for (let attempt = 0; attempt < 20; attempt++) {
      await Bun.sleep(10)
      flushSync(() => {})
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
    }
    const pad = root.renderer.findByTestId("font-pad")!
    const reference = root.renderer.getElementBounds(
      root.renderer.findByTestId("font-reference")!.id
    )!
    expect(root.renderer.findByTestId("font-pad-value")!.style.fontFamily).toBe("Helvetica")
    const width = root.renderer.getElementBounds(pad.id)!.width
    expect(width).toBe(Math.ceil(Math.ceil(reference.width) + padding))
    const bounds = root.renderer.getElementBounds(pad.id)!
    root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    root.renderer.simulateKeystrokes("1")
    root.renderer.flush()
    const editor = root.renderer.findByTestId("font-pad-value")!
    expect(root.renderer.findByType("input")).toHaveLength(1)
    expect(editor.style.fontFamily).toBe("Helvetica")
    expect(root.renderer.getElementBounds(pad.id)!.width).toBe(width)
  } finally {
    root.unmount()
  }
})
