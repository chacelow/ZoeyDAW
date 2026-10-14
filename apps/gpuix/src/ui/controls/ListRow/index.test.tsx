import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { ListRow } from "."

test("list rows accept Enter but preserve Space and exclude disabled items", () => {
  const root = createTestRoot({ width: 300, height: 160 })
  const selected: string[] = []
  try {
    root.render(
      <ThemeProvider>
        <div>
          <ListRow
            testId="enabled"
            label="Wrapped\nresource"
            onClick={() => {
              selected.push("enabled")
            }}
          />
          <ListRow
            testId="disabled"
            label="Unavailable"
            disabled
            onClick={() => {
              selected.push("disabled")
            }}
          />
        </div>
      </ThemeProvider>
    )
    root.renderer.flush()
    const enabled = root.renderer.findByTestId("enabled")
    const disabled = root.renderer.findByTestId("disabled")
    if (!enabled || !disabled) throw new Error("Missing list rows")
    root.renderer.nativeSimulateKeystrokes(enabled.id, "space")
    expect(selected).toEqual([])
    root.renderer.nativeSimulateKeystrokes(enabled.id, "enter")
    root.renderer.nativeSimulateKeystrokes(disabled.id, "enter")
    expect(selected).toEqual(["enabled"])
  } finally {
    root.unmount()
  }
})
