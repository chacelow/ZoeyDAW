import { expect, test } from "bun:test"
import { useState } from "react"
import { handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../ControlEnvironment"

import { DragPadNumber } from "./DragPadNumber"
import type { CursorLockPort, ScreenPoint } from "./cursor-port"

// Host model: a window whose content origin sits at `origin` on screen. Only cursor
// operations are replaced; gpuix input, hit testing and layout stay real.
function cursorHost(origin: ScreenPoint) {
  const state = { position: origin, visible: true, hides: 0 }
  const port: CursorLockPort = {
    capture: point => ({ x: origin.x + point.x, y: origin.y + point.y }),
    hide: () => {
      state.visible = false
      state.hides += 1
    },
    restore: point => {
      state.position = point
      state.visible = true
    },
  }
  return { state, port }
}

function mount(initialPort: CursorLockPort) {
  const root = createTestRoot({ width: 400, height: 240 })
  const values = { latest: 120 }
  function Harness({ port }: { readonly port: CursorLockPort }) {
    const [value, setValue] = useState(120)
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ cursorLock: port }}>
          <div style={{ padding: 80 }}>
            <DragPadNumber
              testId="pad"
              label="Value"
              value={value}
              onChange={next => {
                values.latest = next
                setValue(next)
              }}
              min={20}
              max={300}
              step={1}
            />
          </div>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  root.render(<Harness port={initialPort} />)
  root.renderer.flush()
  const element = root.renderer.findByTestId("pad")!
  const bounds = root.renderer.getElementBounds(element!.id)!
  return {
    ...root,
    values,
    elementId: element.id,
    rerender: (port: CursorLockPort) => root.render(<Harness port={port} />),
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

test("the press event position is the anchor; moves before release do not shift it", () => {
  const host = cursorHost({ x: 500, y: 300 })
  const pad = mount(host.port)
  pad.renderer.nativeSimulateMouseDown(pad.x, pad.y)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 10, 0)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 40, 0)
  expect(pad.values.latest).toBe(130)
  expect(host.state.visible).toBe(false)
  pad.renderer.nativeSimulateMouseUp(pad.x, pad.y - 40)
  expect(host.state).toEqual({
    position: { x: 500 + pad.x, y: 300 + pad.y },
    visible: true,
    hides: 1,
  })
  pad.unmount()
})

test("the port that acquired a drag restores its resource even when the environment changes", () => {
  const first = cursorHost({ x: 100, y: 200 })
  const second = cursorHost({ x: 300, y: 400 })
  const pad = mount(first.port)
  pad.renderer.nativeSimulateMouseDown(pad.x, pad.y)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 40, 0)
  expect(pad.values.latest).toBe(130)
  expect(first.state.visible).toBe(false)
  pad.rerender(second.port)
  pad.renderer.nativeSimulateMouseUp(pad.x, pad.y - 40)
  expect(first.state).toEqual({
    position: { x: 100 + pad.x, y: 200 + pad.y },
    visible: true,
    hides: 1,
  })
  expect(second.state).toEqual({ position: { x: 300, y: 400 }, visible: true, hides: 0 })
  pad.unmount()
})

test("a press without a window position drags without locking the cursor", () => {
  const host = cursorHost({ x: 100, y: 200 })
  const pad = mount(host.port)
  const dispatch = (eventType: string, y?: number) =>
    handleGpuixEvent(
      {
        elementId: pad.elementId,
        eventType,
        x: y === undefined ? undefined : pad.x,
        y,
        button: 0,
        clickCount: 1,
      },
      pad.renderer
    )
  dispatch("mouseDown")
  dispatch("mouseMove", -40)
  expect(pad.values.latest).toBe(130)
  dispatch("mouseUp", -40)
  expect(host.state).toEqual({ position: { x: 100, y: 200 }, visible: true, hides: 0 })
  pad.unmount()
})
