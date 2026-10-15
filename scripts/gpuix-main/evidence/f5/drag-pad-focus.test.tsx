import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../../apps/gpuix/src/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../../../../apps/gpuix/src/ui/controls/ControlEnvironment"
import { DragPadNumber } from "../../../../apps/gpuix/src/ui/controls/DragPad/DragPadNumber"
import type { ControlInfo } from "../../../../apps/gpuix/src/ui/controls/ControlEnvironment"

for (const key of ["enter", "7"]) {
  test(`DragPadNumber ${key} edit delivers the input onFocus once`, () => {
    const root = createTestRoot({ width: 320, height: 180 })
    const info: (ControlInfo | null)[] = []
    try {
      root.render(
        <ThemeProvider>
          <ControlEnvironmentProvider
            value={{
              setInfo: value => {
                info.push(value)
              },
            }}
          >
            <DragPadNumber
              testId="pad"
              label="Value"
              value={120}
              min={0}
              max={300}
              step={1}
              onChange={() => {}}
            />
          </ControlEnvironmentProvider>
        </ThemeProvider>
      )
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      const pad = root.renderer.findByTestId("pad")
      if (!pad) throw new Error("Missing pad")
      if (key === "7") {
        const bounds = root.renderer.getElementBounds(pad.id)
        if (!bounds) throw new Error("Missing pad bounds")
        root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      } else {
        root.renderer.focusElement(pad.id)
      }
      info.length = 0
      root.renderer.nativeSimulateKeystrokes(pad.id, key)
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      const input = root.renderer.findByTestId("pad-value")
      if (!input) throw new Error("Missing editing input")
      expect(input.type).toBe("input")
      expect(root.renderer.getFocusedElementId()).toBe(input.id)
      expect(info.filter(value => value === "number")).toEqual(["number"])
      root.renderer.flush()
      root.renderer.dispatchNativeEvents()
      expect(info.filter(value => value === "number")).toEqual(["number"])
    } finally {
      root.unmount()
    }
  })
}

test("native autofocus reports focus once and JS Tab reports blur once", () => {
  const root = createTestRoot({ width: 320, height: 180 })
  const events: string[] = []
  try {
    root.render(
      <div>
        <input
          testId="first"
          aria-label="First input"
          autoFocus
          onFocus={() => {
            events.push("first:focus")
          }}
          onBlur={() => {
            events.push("first:blur")
          }}
        />
        <input
          testId="next"
          aria-label="Next input"
          onFocus={() => {
            events.push("next:focus")
          }}
        />
      </div>
    )
    root.renderer.dispatchNativeEvents()
    expect(events).toEqual(["first:focus"])
    root.renderer.simulateKeystrokes("tab")
    root.renderer.dispatchNativeEvents()
    const next = root.renderer.findByTestId("next")
    if (!next) throw new Error("Missing Tab destination")
    expect(root.renderer.getFocusedElementId()).toBe(next.id)
    expect(events.filter(event => event.startsWith("first:"))).toEqual([
      "first:focus",
      "first:blur",
    ])
    expect(events.filter(event => event === "next:focus")).toEqual(["next:focus"])
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
    expect(root.renderer.getFocusedElementId()).toBe(next.id)
    expect(events.filter(event => event.startsWith("first:"))).toEqual([
      "first:focus",
      "first:blur",
    ])
  } finally {
    root.unmount()
  }
})
