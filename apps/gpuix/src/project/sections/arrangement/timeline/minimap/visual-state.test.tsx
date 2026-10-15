import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { MiniMap } from "."
import type { MinimapGesture } from "./gesture"

const roots: TestRoot[] = []
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
})

test("overview pressed color survives leaving its bounds and cancellation restores hover", () => {
  const root = createTestRoot({ width: 800, height: 120 })
  roots.push(root)
  let registered: MinimapGesture | undefined
  let normal = ""
  let hover = ""
  let pressed = ""
  let hidden = false
  function Fixture() {
    const theme = useTheme()
    normal = theme.colors.canvasScrollbar
    hover = theme.colors.canvasScrollbarHover
    pressed = theme.colors.canvasScrollbarActive
    return (
      <MiniMap
        width={800}
        height={32}
        label="Overview"
        geometry={{
          bars: 128,
          viewportWidth: 800,
          pxPerBar: 100,
          scrollX: 4000,
          minPxPerBar: 6.25,
          maxPxPerBar: 131072,
        }}
        cursor={{
          capture: point => point,
          hide: () => {
            hidden = true
          },
          restore: () => {
            hidden = false
          },
        }}
        onNavigate={() => {}}
        onViewport={() => {}}
        onFit={() => {}}
        registerGesture={gesture => {
          registered = gesture
          return () => {
            registered = undefined
          }
        }}
      />
    )
  }
  root.render(
    <ThemeProvider>
      <Fixture />
    </ThemeProvider>
  )
  const color = () => root.renderer.findByTestId("minimap-frame")?.style.backgroundColor
  expect(color()).toBe(normal)
  root.renderer.nativeSimulateMouseMove(275, 16, 0)
  expect(color()).toBe(hover)
  root.renderer.nativeSimulateMouseDown(275, 16)
  expect(color()).toBe(pressed)
  root.renderer.nativeSimulateMouseMove(275, 70, 0)
  expect(hidden).toBe(true)
  expect(color()).toBe(pressed)
  root.renderer.nativeSimulateMouseUp(275, 70)
  expect(hidden).toBe(false)
  expect(color()).toBe(normal)
  root.renderer.nativeSimulateMouseMove(275, 16, 0)
  root.renderer.nativeSimulateMouseDown(275, 16)
  expect(registered).toBeDefined()
  flushSync(() => registered?.cancel())
  expect(color()).toBe(hover)
})
