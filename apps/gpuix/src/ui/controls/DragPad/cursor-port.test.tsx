import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../ControlEnvironment"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { DragPadNumber } from "./DragPadNumber"
import type { CursorLockPort, ScreenPoint } from "./cursor-port"

// This host resource model replaces only cursor operations; gpuix input/layout stay real.
function cursorHost(position: ScreenPoint) {
  const state = { position, visible: true }
  const port: CursorLockPort = {
    capture: () => state.position,
    hide: () => {
      state.visible = false
    },
    restore: point => {
      state.position = point
      state.visible = true
    },
  }
  return { state, port }
}

test("the port that acquired a drag restores its resource even when the environment changes", () => {
  const first = cursorHost({ x: 100, y: 200 })
  const second = cursorHost({ x: 300, y: 400 })
  const root = createTestRoot({ width: 400, height: 240 })
  let latest = 120
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
                latest = next
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
  root.render(<Harness port={first.port} />)
  root.renderer.flush()
  const bounds = readOuterBounds(root.renderer, root.renderer.findByTestId("pad"))!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  first.state.position = { x: 100, y: 160 }
  root.renderer.nativeSimulateMouseMove(x, y - 40, 0)
  expect(latest).toBe(130)
  expect(first.state.visible).toBe(false)
  root.render(<Harness port={second.port} />)
  root.renderer.nativeSimulateMouseUp(x, y - 40)
  expect(first.state).toEqual({ position: { x: 100, y: 200 }, visible: true })
  expect(second.state).toEqual({ position: { x: 300, y: 400 }, visible: true })
  root.unmount()
})
