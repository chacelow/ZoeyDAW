import { TEST_INPUT_POLICY } from "./input-policy.test-fixture"
import { expect, test } from "bun:test"
import { useState } from "react"
import { handleGpuixEvent } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../ControlEnvironment"

import { DragPadNumber } from "./DragPadNumber"
import type { CursorLockPort, WindowPoint } from "./cursor-port"

function cursorHost() {
  const state = { begins: 0, ends: [] as (WindowPoint | undefined)[] }
  const port: CursorLockPort = {
    begin: () => {
      state.begins += 1
    },
    end: release => {
      state.ends.push(release)
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
        <ControlEnvironmentProvider value={{ cursorLock: port, inputPolicy: TEST_INPUT_POLICY }}>
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

test("a value drag pins the cursor once and releases it where the drag began", () => {
  const host = cursorHost()
  const pad = mount(host.port)
  pad.renderer.nativeSimulateMouseDown(pad.x, pad.y)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 10, 0)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 40, 0)
  expect(pad.values.latest).toBe(130)
  expect(host.state).toEqual({ begins: 1, ends: [] })
  pad.renderer.nativeSimulateMouseUp(pad.x, pad.y - 40)
  expect(host.state).toEqual({ begins: 1, ends: [undefined] })
  pad.unmount()
})

test("the port that began a drag ends it even when the environment changes", () => {
  const first = cursorHost()
  const second = cursorHost()
  const pad = mount(first.port)
  pad.renderer.nativeSimulateMouseDown(pad.x, pad.y)
  pad.renderer.nativeSimulateMouseMove(pad.x, pad.y - 40, 0)
  expect(pad.values.latest).toBe(130)
  pad.rerender(second.port)
  pad.renderer.nativeSimulateMouseUp(pad.x, pad.y - 40)
  expect(first.state).toEqual({ begins: 1, ends: [undefined] })
  expect(second.state).toEqual({ begins: 0, ends: [] })
  pad.unmount()
})

test("a press without a window position drags without pinning the cursor", () => {
  const host = cursorHost()
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
  expect(host.state).toEqual({ begins: 0, ends: [] })
  pad.unmount()
})
