import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { DragPadNumber } from "../DragPad"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ScrollArea } from "./index"

test("bounded native scrolling moves overflowing content without expanding the viewport", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <ScrollArea testId="scroll" size={{ width: 200, height: 100 }}>
        <div testId="content" style={{ height: 400, flexShrink: 0 }}>
          Long content
        </div>
      </ScrollArea>
    </ThemeProvider>
  )
  root.renderer.flush()
  const scroll = root.renderer.findByTestId("scroll")
  if (!scroll) throw new Error("Scroll area missing")
  expect(root.renderer.getElementBounds(scroll.id)).toMatchObject({
    width: 200,
    height: 100,
  })
  root.renderer.nativeSimulateScrollWheel(50, 50, 0, -80)
  root.renderer.flush()
  expect(root.renderer.getScrollOffset(scroll.id)?.[1]).toBeLessThan(0)
  expect(root.renderer.getElementBounds(scroll.id)?.height).toBe(100)
  root.unmount()
})

test("both-axis scrolling and fill remain bounded by explicit native dimensions", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <div style={{ width: 200, height: 100 }}>
        <ScrollArea testId="scroll" fill orientation="both">
          <div style={{ width: 500, height: 400, flexShrink: 0 }}>Wide content</div>
        </ScrollArea>
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  const scroll = root.renderer.findByTestId("scroll")
  if (!scroll) throw new Error("Scroll area missing")
  expect(root.renderer.getElementBounds(scroll.id)).toMatchObject({
    width: 200,
    height: 100,
  })
  root.renderer.scrollTo(scroll.id, -60, -70)
  expect(root.renderer.getScrollOffset(scroll.id)).toEqual([-60, -70])
  root.unmount()
})

function horizontalRoot(enabled = true, orientation: "horizontal" | "vertical" = "horizontal") {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <ScrollArea
        testId="translated"
        orientation={orientation}
        wheelToHorizontal={enabled}
        size={{ width: 200, height: 100 }}
      >
        <div style={{ width: 600, height: 400, flexShrink: 0 }} />
      </ScrollArea>
    </ThemeProvider>
  )
  const viewport = root.renderer.findByTestId("translated")
  if (!viewport) throw new Error("Missing scroll viewport")
  return { root, id: viewport.id }
}

test("opt-in vertical wheel translates horizontal offset, and vertical/default areas keep native behavior", () => {
  for (const [enabled, orientation] of [
    [true, "horizontal"],
    [false, "horizontal"],
    [true, "vertical"],
  ] satisfies readonly (readonly [boolean, "horizontal" | "vertical"])[]) {
    const { root, id } = horizontalRoot(enabled, orientation)
    try {
      root.renderer.nativeSimulateScrollWheel(50, 50, 0, -40)
      expect(root.renderer.getScrollOffset(id)).toEqual(
        orientation === "vertical" ? [0, -40] : enabled ? [-40, 0] : [0, 0]
      )
    } finally {
      root.unmount()
    }
  }
})

test("existing horizontal wheel delta is not translated twice", () => {
  const { root, id } = horizontalRoot()
  try {
    root.renderer.nativeSimulateScrollWheel(50, 50, -70, -30)
    expect(root.renderer.getScrollOffset(id)).toEqual([-70, 0])
  } finally {
    root.unmount()
  }
})

test("ctrl and meta vertical wheel are not translated", () => {
  for (const modifier of ["ctrl", "cmd"]) {
    const { root, id } = horizontalRoot()
    try {
      root.renderer.nativeSimulateScrollWheel(50, 50, 0, -40, modifier)
      expect(root.renderer.getScrollOffset(id)).toEqual([0, 0])
    } finally {
      root.unmount()
    }
  }
})

test("numeric child consumes its wheel without moving the horizontal ancestor", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  let latest = 50
  function Form() {
    const [value, setValue] = useState(50)
    return (
      <ThemeProvider>
        <ScrollArea
          testId="numeric-scroll"
          orientation="horizontal"
          wheelToHorizontal
          size={{ width: 200, height: 100 }}
        >
          <div style={{ width: 600, height: 100, flexShrink: 0 }}>
            <DragPadNumber
              testId="wheel-pad"
              label="Value"
              value={value}
              min={0}
              max={100}
              step={1}
              onChange={next => {
                latest = next
                setValue(next)
              }}
            />
          </div>
        </ScrollArea>
      </ThemeProvider>
    )
  }
  try {
    root.render(<Form />)
    const viewport = root.renderer.findByTestId("numeric-scroll")
    const pad = root.renderer.findByTestId("wheel-pad")
    const bounds = pad ? root.renderer.getElementBounds(pad.id) : null
    if (!viewport || !bounds) throw new Error("Missing numeric geometry")
    root.renderer.nativeSimulateScrollWheel(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      0,
      -32
    )
    expect(latest).toBe(48)
    expect(root.renderer.getScrollOffset(viewport.id)).toEqual([0, 0])
  } finally {
    root.unmount()
  }
})
