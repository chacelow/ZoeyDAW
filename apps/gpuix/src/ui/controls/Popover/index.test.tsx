import { afterEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { useState } from "react"
import type { TestRoot } from "@gpuix/react/testing"
import type { FloatingAlign, FloatingSide } from "@gpuix/react/floating"
import type { ReactNode } from "react"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { DragPadNumber } from "../DragPad/DragPadNumber"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "."

const roots: TestRoot[] = []

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
})

function mount(children: ReactNode, width = 640, height = 400) {
  const root = createTestRoot({ width, height })
  roots.push(root)
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  root.renderer.flush()
  return root
}

function element(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  return node
}

function bounds(root: TestRoot, testId: string) {
  const node = element(root, testId)
  const box = readOuterBounds(root.renderer, root.renderer.getElement(node.id))
  if (!box) throw new Error(`Unpainted ${testId}`)
  return box
}

function click(root: TestRoot, testId: string) {
  const box = bounds(root, testId)
  root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
}

function press(root: TestRoot, testId: string, key: string) {
  root.renderer.nativeSimulateKeyDown(element(root, testId).id, key)
}

const triggerStyle = { width: 120, height: 24 }

describe("native popovers", () => {
  test("Button asChild emits one change per Enter and ignores Space", () => {
    const changes: boolean[] = []
    const root = mount(
      <Popover
        onOpenChange={value => {
          changes.push(value)
        }}
      >
        <PopoverTrigger asChild>
          <Button testId="trigger">Details</Button>
        </PopoverTrigger>
        <PopoverContent testId="content">Content</PopoverContent>
      </Popover>
    )
    press(root, "trigger", "enter")
    expect(changes).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "trigger", "space")
    expect(changes).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "trigger", "enter")
    expect(changes).toEqual([true, false])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    click(root, "trigger")
    const trigger = bounds(root, "trigger")
    root.renderer.nativeSimulateClick(trigger.x + 0.25, trigger.y + trigger.height / 2)
    expect(changes).toEqual([true, false, true, false])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  })

  test("asChild preserves the native child and toggles without outside-dismiss races", () => {
    let clicks = 0
    const changes: boolean[] = []
    const root = mount(
      <Popover
        onOpenChange={value => {
          changes.push(value)
        }}
      >
        <PopoverTrigger asChild>
          <div
            testId="trigger"
            style={triggerStyle}
            role="button"
            tabIndex={0}
            aria-disabled={false}
            onKeyDown={event => {
              if (event.key === "enter" || event.key === "space") clicks += 1
            }}
            onClick={() => {
              clicks += 1
            }}
          >
            Details
          </div>
        </PopoverTrigger>
        <PopoverContent testId="content">
          <PopoverHeader>
            <PopoverTitle>Title</PopoverTitle>
            <div>Arbitrary content</div>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    )
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    click(root, "trigger")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "content").id)
    click(root, "trigger")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    expect(clicks).toBe(2)
    expect(changes).toEqual([true, false])
  })

  test("Enter toggles, Space is reserved, and Escape restores trigger focus", () => {
    const root = mount(
      <Popover>
        <PopoverTrigger testId="trigger" style={triggerStyle}>
          Details
        </PopoverTrigger>
        <PopoverContent testId="content">Content</PopoverContent>
      </Popover>
    )
    press(root, "trigger", "enter")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "content", "escape")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "trigger").id)
    press(root, "trigger", "space")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    press(root, "trigger", "enter")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "trigger", "space")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "trigger", "enter")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  })

  test("controlled roots request changes without changing the provided state", () => {
    const changes: boolean[] = []
    const root = mount(
      <Popover
        open={false}
        onOpenChange={value => {
          changes.push(value)
        }}
      >
        <PopoverTrigger testId="trigger" style={triggerStyle}>
          Details
        </PopoverTrigger>
        <PopoverContent testId="content">Content</PopoverContent>
      </Popover>
    )
    click(root, "trigger")
    expect(changes).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.render(
      <ThemeProvider>
        <Popover
          open
          onOpenChange={value => {
            changes.push(value)
          }}
        >
          <PopoverTrigger testId="trigger" style={triggerStyle}>
            Details
          </PopoverTrigger>
          <PopoverContent testId="content">Content</PopoverContent>
        </Popover>
      </ThemeProvider>
    )
    root.renderer.flush()
    root.renderer.nativeSimulateMouseDown(610, 370)
    expect(changes).toEqual([true, false])
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
  })

  test("disabled native triggers and disabled roots ignore click, Enter and Space", () => {
    for (const rootDisabled of [false, true]) {
      const changes: boolean[] = []
      const root = mount(
        <Popover
          disabled={rootDisabled}
          onOpenChange={value => {
            changes.push(value)
          }}
        >
          <PopoverTrigger disabled={!rootDisabled} testId="trigger" style={triggerStyle}>
            Unavailable
          </PopoverTrigger>
          <PopoverContent testId="content">Content</PopoverContent>
        </Popover>
      )
      click(root, "trigger")
      press(root, "trigger", "enter")
      press(root, "trigger", "space")
      expect(changes).toEqual([])
      expect(root.renderer.findByTestId("content")).toBeUndefined()
    }
  })

  test("inside clicks stay open, movement outside stays open, outside mouse-down dismisses", () => {
    let interactions = 0
    const root = mount(
      <Popover defaultOpen>
        <PopoverTrigger testId="trigger" style={triggerStyle}>
          Details
        </PopoverTrigger>
        <PopoverContent testId="content">
          <div
            testId="inside"
            role="button"
            tabIndex={0}
            aria-disabled={false}
            style={{ width: 90, height: 24 }}
            onClick={() => {
              interactions += 1
            }}
            onKeyDown={event => {
              if (event.key === "enter" || event.key === "space") interactions += 1
            }}
          >
            Interact
          </div>
        </PopoverContent>
      </Popover>
    )
    click(root, "inside")
    expect(interactions).toBe(1)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseMove(610, 370)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseDown(610, 370)
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
  })

  test("an actual DragPad press/release and wheel edit do not dismiss arbitrary content", () => {
    let latest = 120
    function Harness() {
      const [value, setValue] = useState(120)
      return (
        <Popover defaultOpen>
          <PopoverTrigger testId="trigger" style={triggerStyle}>
            Tempo
          </PopoverTrigger>
          <PopoverContent testId="content">
            <DragPadNumber
              testId="pad"
              label="Tempo"
              min={20}
              max={300}
              step={1}
              value={value}
              editable={false}
              onChange={next => {
                latest = next
                setValue(next)
              }}
            />
          </PopoverContent>
        </Popover>
      )
    }
    const root = mount(<Harness />)
    const box = bounds(root, "pad")
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    root.renderer.nativeSimulateMouseDown(x, y)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseUp(x, y)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateScrollWheel(x, y, 0, 16)
    expect(latest).not.toBe(120)
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })

  test("a pointer gesture may leave the popover without dismissing until a new outside press", () => {
    const root = mount(
      <Popover defaultOpen>
        <PopoverTrigger style={triggerStyle}>Details</PopoverTrigger>
        <PopoverContent testId="content">
          <div
            testId="gesture"
            role="slider"
            tabIndex={0}
            aria-disabled={false}
            aria-valuenow={0}
            style={{ width: 100, height: 24 }}
            onMouseDown={() => {}}
            onMouseMove={() => {}}
            onMouseUp={() => {}}
          >
            Drag
          </div>
        </PopoverContent>
      </Popover>
    )
    const box = bounds(root, "gesture")
    root.renderer.nativeSimulateMouseDown(box.x + 10, box.y + 10)
    root.renderer.nativeSimulateMouseMove(610, 370, 0)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseDown(610, 370)
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
  })

  test("all sides and alignments use native anchor geometry and sideOffset", () => {
    const sides: FloatingSide[] = ["left", "right", "top", "bottom"]
    const alignments: FloatingAlign[] = ["start", "center", "end"]
    for (const side of sides) {
      for (const align of alignments) {
        const root = mount(
          <Popover defaultOpen style={{ marginLeft: 250, marginTop: 160 }}>
            <PopoverTrigger testId="trigger" style={triggerStyle}>
              Details
            </PopoverTrigger>
            <PopoverContent
              testId="content"
              side={side}
              align={align}
              sideOffset={10}
              style={{ width: 100, height: 50 }}
            >
              Content
            </PopoverContent>
          </Popover>
        )
        const trigger = bounds(root, "trigger")
        const content = bounds(root, "content")
        if (side === "left") expect(content.x + content.width).toBeCloseTo(trigger.x - 10, 0)
        if (side === "right") expect(content.x).toBeCloseTo(trigger.x + trigger.width + 10, 0)
        if (side === "top") expect(content.y + content.height).toBeCloseTo(trigger.y - 10, 0)
        if (side === "bottom") expect(content.y).toBeCloseTo(trigger.y + trigger.height + 10, 0)
        const horizontal = side === "top" || side === "bottom"
        const contentStart = horizontal ? content.x : content.y
        const contentSize = horizontal ? content.width : content.height
        const triggerStart = horizontal ? trigger.x : trigger.y
        const triggerSize = horizontal ? trigger.width : trigger.height
        const expected =
          align === "start"
            ? triggerStart
            : align === "end"
              ? triggerStart + triggerSize - contentSize
              : triggerStart + (triggerSize - contentSize) / 2
        expect(contentStart).toBeCloseTo(expected, 0)
      }
    }
  })

  test("intrinsic-height center alignment uses the measured native surface", async () => {
    const root = mount(
      <Popover defaultOpen style={{ marginLeft: 250, marginTop: 160 }}>
        <PopoverTrigger testId="trigger" style={triggerStyle}>
          Details
        </PopoverTrigger>
        <PopoverContent
          testId="content"
          side="left"
          align="center"
          sideOffset={10}
          style={{ width: 100 }}
        >
          <div style={{ height: 50 }}>Content</div>
        </PopoverContent>
      </Popover>
    )
    for (let attempt = 0; attempt < 20; attempt++) {
      await Bun.sleep(10)
      flushSync(() => {})
      root.renderer.flush()
      const trigger = bounds(root, "trigger")
      const content = bounds(root, "content")
      if (Math.abs(content.y + content.height / 2 - trigger.y - trigger.height / 2) < 0.5) break
    }
    const trigger = bounds(root, "trigger")
    const content = bounds(root, "content")
    expect(content.x + content.width).toBeCloseTo(trigger.x - 10, 0)
    expect(content.y + content.height / 2).toBeCloseTo(trigger.y + trigger.height / 2, 0)
  })

  test("oversized multiline surfaces clamp to the window and preserve explicit smaller maxima", () => {
    for (const maximum of [undefined, 180]) {
      const root = mount(
        <Popover defaultOpen style={{ marginLeft: 240, marginTop: 170 }}>
          <PopoverTrigger style={{ width: 40, height: 24 }}>Details</PopoverTrigger>
          <PopoverContent
            testId="content"
            style={{ width: 1000, height: 1000, maxWidth: maximum, maxHeight: maximum }}
            collisionPadding={8}
          >
            <PopoverHeader>
              <PopoverTitle>Multiline title</PopoverTitle>
              <div>{"First line\nSecond line with wrapping content"}</div>
            </PopoverHeader>
          </PopoverContent>
        </Popover>,
        320,
        240
      )
      const box = bounds(root, "content")
      expect(box.width).toBeLessThanOrEqual(maximum ?? 304)
      expect(box.height).toBeLessThanOrEqual(maximum ?? 224)
      expect(box.x).toBeGreaterThanOrEqual(8)
      expect(box.y).toBeGreaterThanOrEqual(8)
      expect(box.x + box.width).toBeLessThanOrEqual(312)
      expect(box.y + box.height).toBeLessThanOrEqual(232)
    }
  })
})
