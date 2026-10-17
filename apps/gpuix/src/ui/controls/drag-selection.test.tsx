import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { useDividerDrag } from "../panels/useDividerDrag"
import { ControlEnvironmentProvider } from "./ControlEnvironment"
import { DragPadBar, DragPadBipolar, DragPadNumber } from "./DragPad"
import { TEST_INPUT_POLICY } from "./DragPad/input-policy.test-fixture"
import { Fader } from "./Fader"
import { Knob } from "./Knob"

for (const kind of ["number", "bar", "bipolar", "knob", "fader", "divider"] as const)
  test(`${kind} drag crosses selectable window text without selecting it`, () => {
    const root = createTestRoot({ width: 500, height: 400 })
    let latest = 0
    function Fixture() {
      const [value, setValue] = useState(0)
      const change = (next: number) => {
        latest = next
        setValue(next)
      }
      const divider = useDividerDrag({
        orientation: "horizontal",
        start: () => value,
        move: (start, delta) => change(start - delta),
        restore: change,
      })
      const props = {
        testId: "control",
        label: "Gain",
        value,
        onChange: change,
        min: -100,
        max: 100,
        step: 1,
      }
      return (
        <div style={{ position: "relative", width: 500, height: 400 }}>
          <text testId="other-text" style={{ position: "absolute", top: 20, width: 400, height: 30 }}>
            Selectable text outside the drag owner
          </text>
          <div style={{ position: "absolute", top: 200 }}>
            {kind === "number" ? <DragPadNumber {...props} />
              : kind === "bar" ? <DragPadBar {...props} />
              : kind === "bipolar" ? <DragPadBipolar {...props} />
              : kind === "knob" ? <Knob {...props} />
              : kind === "fader" ? <Fader {...props} />
              : (
                <div
                  testId="control"
                  role="separator"
                  aria-orientation="horizontal"
                  tabIndex={0}
                  style={{ width: 100, height: 20, userSelect: "none", pointerEvents: "auto" }}
                  onMouseDown={divider.onMouseDown}
                  onMouseMove={divider.onMouseMove}
                  onMouseUp={divider.onMouseUp}
                  onBlur={divider.onBlur}
                />
              )}
          </div>
        </div>
      )
    }
    try {
      root.render(
        <ThemeProvider>
          <ControlEnvironmentProvider value={{ inputPolicy: TEST_INPUT_POLICY }}>
            <Fixture />
          </ControlEnvironmentProvider>
        </ThemeProvider>
      )
      const control = root.renderer.findByTestId("control")
      const bounds = control && root.renderer.getElementBounds(control.id)
      const text = root.renderer.findByTestId("other-text")
      const textBounds = text && root.renderer.getElementBounds(text.id)
      if (!bounds || !textBounds) throw new Error("Drag fixture not painted")
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      const textY = textBounds.y + textBounds.height / 2
      expect(root.renderer.dragSelect(textBounds.x + 1, textY, 399, textY)).not.toBeNull()
      root.renderer.nativeSimulateMouseMove(x, y)
      root.renderer.nativeSimulateMouseDown(x, y)
      expect(root.renderer.getSelectedText()).toBeNull()
      root.renderer.nativeSimulateMouseMove(x, textY, 0)
      expect(latest).toBeGreaterThan(0)
      expect(root.renderer.getSelectedText()).toBeNull()
      root.renderer.nativeSimulateMouseMove(399, textY, 0)
      expect(root.renderer.getSelectedText()).toBeNull()
      root.renderer.nativeSimulateMouseUp(399, textY)
      expect(root.renderer.getSelectedText()).toBeNull()
      expect(root.renderer.dragSelect(textBounds.x + 1, textY, 399, textY)).not.toBeNull()
    } finally {
      root.unmount()
    }
  })
