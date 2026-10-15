import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { ElementBounds } from "@gpuix/native/host"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlledScrollbar } from "./ControlledScrollbar"
import { scrollbarGeometry } from "./scrollbar-geometry"

const { join } = path

function mount(orientation: "horizontal" | "vertical", extent = 1000) {
  const root = createTestRoot({ width: 400, height: 400 })
  let current = 0
  function Harness() {
    const [value, setValue] = useState(0)
    return (
      <ThemeProvider>
        <ControlledScrollbar
          testId="scrollbar"
          aria-label="Timeline scroll"
          aria-controls="timeline"
          orientation={orientation}
          value={value}
          viewport={100}
          extent={extent}
          length={200}
          onChange={next => {
            current = next
            setValue(next)
          }}
        />
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  return { ...root, value: () => current }
}

describe("Controlled scrollbar", () => {
  test("thumb dragging maps both axes to logical extent and clamps at each boundary", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const a = mount(orientation)
      const horizontal = orientation === "horizontal"
      a.renderer.nativeSimulateMouseDown(5, 5)
      a.renderer.nativeSimulateMouseMove(horizontal ? 500 : 5, horizontal ? 5 : 500, 0)
      a.renderer.flush()
      expect(a.value()).toBe(900)
      a.renderer.nativeSimulateMouseMove(horizontal ? -500 : 5, horizontal ? 5 : -500, 0)
      a.renderer.flush()
      expect(a.value()).toBe(0)
      a.renderer.nativeSimulateMouseUp(5, 5)
      a.unmount()
    }
  })

  test("releasing a drag ends it before handing mouse-up to the caller", () => {
    const root = createTestRoot({ width: 400, height: 400 })
    const released: number[] = []
    let current = 0
    function Harness() {
      const [value, setValue] = useState(0)
      return (
        <ThemeProvider>
          <ControlledScrollbar
            testId="scrollbar"
            aria-label="Pattern scroll"
            aria-controls="pattern"
            orientation="horizontal"
            value={value}
            viewport={100}
            extent={1000}
            length={200}
            onChange={next => {
              current = next
              setValue(next)
            }}
            onMouseUp={() => {
              released.push(current)
            }}
          />
        </ThemeProvider>
      )
    }
    root.render(<Harness />)
    root.renderer.flush()
    root.renderer.nativeSimulateMouseDown(5, 5)
    root.renderer.nativeSimulateMouseMove(500, 5, 0)
    root.renderer.nativeSimulateMouseUp(500, 5)
    root.renderer.flush()
    expect(released).toEqual([900])
    root.renderer.nativeSimulateMouseMove(5, 5, 0)
    root.renderer.flush()
    expect(current).toBe(900)
    root.unmount()
  })

  test("keyboard Home/End and page navigation preserve logical boundaries", () => {
    const a = mount("horizontal")
    a.renderer.nativeSimulateClick(5, 5)
    a.renderer.simulateKeystrokes("end")
    a.renderer.flush()
    expect(a.value()).toBe(900)
    a.renderer.simulateKeystrokes("pageup")
    a.renderer.flush()
    expect(a.value()).toBe(800)
    a.renderer.simulateKeystrokes("home right")
    a.renderer.flush()
    expect(a.value()).toBe(10)
    a.unmount()
  })

  test("a fitting extent cannot scroll even on wheel, click, or key input", () => {
    const a = mount("horizontal", 80)
    a.renderer.nativeSimulateClick(100, 5)
    a.renderer.nativeSimulateScrollWheel(10, 5, 100, 100)
    a.renderer.simulateKeystrokes("end")
    expect(a.value()).toBe(0)
    a.unmount()
  })

  test("navigation keys stay in the scrollbar while Space reaches the window playback owner", () => {
    const keys: string[] = []
    const root = createTestRoot({
      width: 400,
      height: 100,
      onKeyDown: event => {
        if (event.key) keys.push(event.key)
      },
    })
    let current = 0
    function Harness() {
      const [value, setValue] = useState(0)
      return (
        <ThemeProvider>
          <ControlledScrollbar
            testId="scrollbar"
            aria-label="Timeline scroll"
            aria-controls="timeline"
            orientation="horizontal"
            value={value}
            viewport={100}
            extent={1000}
            length={200}
            onChange={next => {
              current = next
              setValue(next)
            }}
          />
        </ThemeProvider>
      )
    }
    try {
      root.render(<Harness />)
      const bar = root.renderer.findByTestId("scrollbar")
      if (!bar) throw new Error("Scrollbar missing")
      root.renderer.nativeSimulateKeystrokes(bar.id, "right")
      expect(current).toBe(10)
      expect(keys).toEqual([])
      root.renderer.nativeSimulateKeystrokes(bar.id, "space")
      expect(keys).toEqual(["space"])
      expect(current).toBe(10)
    } finally {
      root.unmount()
    }
  })

  test("hovered scrollbar consumes its wheel instead of also moving the canvas ancestor", () => {
    const root = createTestRoot({ width: 400, height: 100 })
    let canvasScroll = 0
    let current = 0
    function Harness() {
      const [value, setValue] = useState(0)
      return (
        <ThemeProvider>
          <div
            style={{ width: 200, height: 100 }}
            onScroll={event => {
              canvasScroll -= event.deltaY ?? 0
            }}
          >
            <ControlledScrollbar
              aria-label="Timeline scroll"
              aria-controls="timeline"
              orientation="horizontal"
              value={value}
              viewport={100}
              extent={1000}
              length={200}
              onChange={next => {
                current = next
                setValue(next)
              }}
            />
          </div>
        </ThemeProvider>
      )
    }
    try {
      root.render(<Harness />)
      root.renderer.nativeSimulateScrollWheel(50, 5, 0, -40)
      expect(current).toBe(40)
      expect(canvasScroll).toBe(0)
      root.renderer.nativeSimulateScrollWheel(50, 50, 0, -40)
      expect(canvasScroll).toBe(40)
      expect(current).toBe(40)
    } finally {
      root.unmount()
    }
  })

  test("geometry conserves thumb travel and reaches every logical endpoint across random extents", () => {
    let seed = 91237
    for (let i = 0; i < 2000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const extent = 1 + (seed / 2 ** 32) * 1e9
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const viewport = ((extent * seed) / 2 ** 32) * 1.5
      const length = 50 + (i % 600)
      const start = scrollbarGeometry(-extent, viewport, extent, length, 10)
      const end = scrollbarGeometry(extent * 2, viewport, extent, length, 10)
      expect(start.value).toBe(0)
      expect(start.offset).toBe(0)
      expect(end.value).toBe(Math.max(0, extent - viewport))
      expect(end.offset).toBeCloseTo(end.travel)
      expect(end.thumb + end.travel).toBeCloseTo(length)
      expect(end.thumb).toBeGreaterThanOrEqual(10)
      expect(end.thumb).toBeLessThanOrEqual(length)
    }
  })
})

for (const appearance of ["dark", "light"] as const)
  for (const orientation of ["horizontal", "vertical"] as const) {
    test(`native GPU disabled scrollbar is distinct at identical geometry (${appearance}/${orientation})`, () => {
      const directory = mkdtempSync(join(tmpdir(), "scrollbar-disabled-"))
      const path = join(directory, "frame.png")
      const root = createTestRoot({ width: 220, height: 220 })
      let value = 0
      try {
        let enabledFrame: Buffer | undefined
        let enabledBounds: ElementBounds | null = null
        for (const disabled of [false, true]) {
          root.render(
            <ThemeProvider appearance={appearance}>
              <ControlledScrollbar
                testId="visual-scrollbar"
                aria-label="Timeline scroll"
                aria-controls="timeline"
                orientation={orientation}
                value={0}
                viewport={100}
                extent={1000}
                length={200}
                disabled={disabled}
                onChange={next => {
                  value = next
                }}
              />
            </ThemeProvider>
          )
          root.renderer.nativeSimulateMouseMove(215, 215)
          const node = root.renderer.findByTestId("visual-scrollbar")
          if (!node) throw new Error("Missing scrollbar")
          const bounds = root.renderer.getElementBounds(node.id)
          root.renderer.captureScreenshot(path)
          const frame = readFileSync(path)
          if (!disabled) {
            enabledFrame = frame
            enabledBounds = bounds
          } else {
            if (!enabledFrame) throw new Error("Missing enabled baseline")
            expect(bounds).toEqual(enabledBounds)
            expect(frame.equals(enabledFrame)).toBe(false)
            root.renderer.nativeSimulateScrollWheel(5, 5, 0, -40)
            expect(value).toBe(0)
          }
        }
      } finally {
        root.unmount()
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
