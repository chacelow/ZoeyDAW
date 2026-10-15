import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inflateSync } from "node:zlib"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { DragPadNumber } from "../DragPad"
import { ListRow } from "../ListRow"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ScrollArea } from "./index"

const { join } = path

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

function nativePixels(path: string) {
  const png = readFileSync(path)
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
    throw new Error("Expected noninterlaced native RGBA8 PNG")
  const chunks: Buffer[] = []
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset)
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + size))
    offset += size + 12
  }
  const scanlines = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const corner = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      const estimate = left + above - corner
      const paeth =
        Math.abs(estimate - left) <= Math.abs(estimate - above) &&
        Math.abs(estimate - left) <= Math.abs(estimate - corner)
          ? left
          : Math.abs(estimate - above) <= Math.abs(estimate - corner)
            ? above
            : corner
      if (filter > 4) throw new Error(`Unexpected PNG filter ${filter}`)
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth
      pixels[y * stride + x] = (scanlines[y * (stride + 1) + x + 1] + predictor) & 255
    }
  }
  return { width, height, pixels }
}

for (const appearance of ["dark", "light"] as const) {
  test(`native keyboard focus paints an inset ring without dimming scroll contents (${appearance})`, () => {
    const directory = mkdtempSync(join(tmpdir(), "scroll-area-focus-"))
    const path = join(directory, "frame.png")
    const root = createTestRoot({ width: 220, height: 100 })
    try {
      root.render(
        <ThemeProvider appearance={appearance}>
          <ScrollArea testId="scroll-focus" size={{ width: 200, height: 80 }}>
            <div style={{ height: 300 }}>
              {Array.from({ length: 12 }, (_, index) => (
                <ListRow key={index} label={`Readable resource ${index}`} tabIndex={-1} />
              ))}
            </div>
          </ScrollArea>
        </ThemeProvider>
      )
      root.renderer.nativeSimulateMouseMove(215, 95)
      root.renderer.captureScreenshot(path)
      const idle = nativePixels(path)
      root.renderer.simulateKeystrokes("tab")
      const focusTarget = root.renderer.findByTestId("scroll-focus")
      if (!focusTarget) throw new Error("Missing scroll focus target")
      expect(root.renderer.getFocusedElementId()).toBe(focusTarget.id)
      root.renderer.captureScreenshot(path)
      const focus = nativePixels(path)
      let edgeChanges = 0
      let contentChanges = 0
      for (let y = 0; y < 80; y++)
        for (let x = 0; x < 200; x++) {
          const offset = (y * idle.width + x) * 4
          if (
            !idle.pixels
              .subarray(offset, offset + 4)
              .equals(focus.pixels.subarray(offset, offset + 4))
          ) {
            if (x < 2 || y < 2 || x >= 198 || y >= 78) edgeChanges++
            else contentChanges++
          }
        }
      expect(contentChanges).toBe(0)
      expect(edgeChanges).toBeGreaterThan(0)
    } finally {
      root.unmount()
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
