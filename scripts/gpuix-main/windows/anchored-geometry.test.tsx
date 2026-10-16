import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { DEFAULT_DESIGN_TOKENS } from "../../../apps/gpuix/src/shared/theme/design-tokens"
import { ThemeProvider } from "../../../apps/gpuix/src/shared/theme/ThemeProvider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../apps/gpuix/src/ui/controls/Popover"

const sides = ["top", "right", "bottom", "left"] as const
const alignments = ["start", "center", "end"] as const

test.each([1, 2])(
  "anchored boxes preserve parity, size and alignment at scale %s",
  scaleFactor => {
    const root = createTestRoot({ width: 800, height: 600, scaleFactor })
    try {
      for (const [triggerWidth, triggerHeight, width, height] of [
        [43, 41, 274, 88],
        [44, 42, 275, 89],
      ]) {
        for (const [left, top] of [
          [0, 0],
          [300, 220],
        ]) {
          for (const side of sides) {
            for (const align of alignments) {
              root.render(
                <ThemeProvider
                  appearance="dark"
                  design={{
                    ...DEFAULT_DESIGN_TOKENS,
                    popover: { ...DEFAULT_DESIGN_TOKENS.popover, width },
                  }}
                >
                  <div style={{ position: "absolute", left, top }}>
                    <Popover defaultOpen>
                      <PopoverTrigger
                        testId="trigger"
                        style={{ width: triggerWidth, height: triggerHeight }}
                      >
                        Open
                      </PopoverTrigger>
                      <PopoverContent
                        testId="surface"
                        side={side}
                        align={align}
                        sideOffset={0}
                        collisionPadding={0}
                        style={{ height }}
                      />
                    </Popover>
                  </div>
                </ThemeProvider>
              )
              const trigger = root.renderer.findByTestId("trigger")
              const surface = root.renderer.findByTestId("surface")
              if (!trigger || !surface) throw new Error("Anchored fixture did not mount")
              const a = root.renderer.getElementBounds(trigger.id)
              const b = root.renderer.getElementBounds(surface.id)
              if (!a || !b) throw new Error("Anchored fixture did not paint")
              expect([b.width, b.height]).toEqual([width, height])
              const horizontal = side === "top" || side === "bottom"
              const crossOrigin = horizontal ? a.x : a.y
              const crossTrigger = horizontal ? a.width : a.height
              const crossContent = horizontal ? width : height
              const cross =
                align === "start"
                  ? crossOrigin
                  : align === "end"
                    ? crossOrigin + crossTrigger - crossContent
                    : crossOrigin + (crossTrigger - crossContent) / 2
              const x = horizontal ? cross : side === "left" ? a.x - width : a.x + a.width
              const y = horizontal ? (side === "top" ? a.y - height : a.y + a.height) : cross
              expect(Math.abs(b.x - Math.max(0, Math.min(800 - width, x)))).toBeLessThanOrEqual(0.5)
              expect(Math.abs(b.y - Math.max(0, Math.min(600 - height, y)))).toBeLessThanOrEqual(
                0.5
              )
            }
          }
        }
      }
    } finally {
      root.unmount()
    }
  },
  15_000
)

test.each([1, 2])(
  "switch fitting flips at each viewport edge without resizing at scale %s",
  scaleFactor => {
    const root = createTestRoot({ width: 800, height: 600, scaleFactor })
    try {
      for (const [side, position, expected] of [
        ["bottom", [400, 590], [263, 502]],
        ["top", [400, 10], [263, 10]],
        ["right", [790, 300], [516, 256]],
        ["left", [10, 300], [10, 256]],
      ] satisfies [(typeof sides)[number], [number, number], [number, number]][]) {
        root.render(
          <anchored
            testId="surface"
            side={side}
            align="center"
            position={{ x: position[0], y: position[1] }}
            gap={0}
            fit="switch"
            style={{ width: 274, height: 88 }}
          />
        )
        const surface = root.renderer.findByTestId("surface")
        if (!surface) throw new Error("Switch-fit fixture did not mount")
        const bounds = root.renderer.getElementBounds(surface.id)
        if (!bounds) throw new Error("Switch-fit fixture did not paint")
        expect([bounds.width, bounds.height]).toEqual([274, 88])
        expect([bounds.x, bounds.y]).toEqual(expected)
      }
    } finally {
      root.unmount()
    }
  }
)
