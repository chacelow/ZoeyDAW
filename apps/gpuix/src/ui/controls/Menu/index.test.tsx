import { afterEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { readOuterBounds } from "../useMeasuredTextWidth"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "."

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

function click(root: TestRoot, testId: string, button = 0, modifiers?: string) {
  const box = bounds(root, testId)
  root.renderer.nativeSimulateClick(
    box.x + box.width / 2,
    box.y + box.height / 2,
    button,
    modifiers
  )
}

function press(root: TestRoot, testId: string, key: string) {
  root.renderer.nativeSimulateKeyDown(element(root, testId).id, key)
}

const triggerStyle = { width: 120, height: 24 }

describe("native command menus", () => {
  test("Button asChild keyboard activation requests each transition exactly once", () => {
    const changes: boolean[] = []
    const root = mount(
      <DropdownMenu
        onOpenChange={value => {
          changes.push(value)
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button testId="trigger">Commands</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <DropdownMenuItem testId="command">Command</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    press(root, "trigger", "enter")
    expect(changes).toEqual([true])
    press(root, "command", "escape")
    expect(changes).toEqual([true, false])
    press(root, "trigger", "space")
    expect(changes).toEqual([true, false])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    press(root, "trigger", "enter")
    expect(changes).toEqual([true, false, true])
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })

  test("asChild preserves the native trigger and commands close after both callbacks", () => {
    const changes: boolean[] = []
    const selected: string[] = []
    let triggerClicks = 0
    const root = mount(
      <DropdownMenu
        onOpenChange={value => {
          changes.push(value)
        }}
      >
        <DropdownMenuTrigger asChild>
          <div
            testId="trigger"
            style={triggerStyle}
            role="button"
            tabIndex={0}
            aria-disabled={false}
            onKeyDown={event => {
              if (event.key === "enter" || event.key === "space") triggerClicks += 1
            }}
            onClick={() => {
              triggerClicks += 1
            }}
          >
            Commands
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <DropdownMenuItem
            testId="first"
            onSelect={() => {
              selected.push("select")
            }}
            onClick={() => {
              selected.push("click")
            }}
          >
            Run
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    click(root, "trigger")
    expect(triggerClicks).toBe(1)
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "first").id)
    press(root, "first", "enter")
    expect(selected).toEqual(["select", "click"])
    expect(changes).toEqual([true, false])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  })

  test("up/down, Home and End navigate enabled commands with wraparound", () => {
    let disabledSelections = 0
    const root = mount(
      <DropdownMenu>
        <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
          Commands
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <DropdownMenuItem testId="first">First</DropdownMenuItem>
          <DropdownMenuItem
            testId="disabled"
            disabled
            onSelect={() => {
              disabledSelections += 1
            }}
          >
            Disabled
          </DropdownMenuItem>
          <DropdownMenuItem testId="last">Last</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    press(root, "trigger", "down")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "first").id)
    press(root, "first", "down")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "last").id)
    press(root, "last", "down")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "first").id)
    press(root, "first", "up")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "last").id)
    press(root, "last", "home")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "first").id)
    press(root, "first", "end")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "last").id)
    click(root, "disabled")
    press(root, "disabled", "enter")
    expect(disabledSelections).toBe(0)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    press(root, "last", "escape")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "trigger").id)
    press(root, "trigger", "up")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "last").id)
  })

  test("controlled state requests transitions without mutating its owner", () => {
    const requests: boolean[] = []
    const root = mount(
      <DropdownMenu
        open={false}
        onOpenChange={value => {
          requests.push(value)
        }}
      >
        <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
          Commands
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <DropdownMenuItem>Command</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    click(root, "trigger")
    expect(requests).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.render(
      <ThemeProvider>
        <DropdownMenu
          open
          onOpenChange={value => {
            requests.push(value)
          }}
        >
          <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
            Commands
          </DropdownMenuTrigger>
          <DropdownMenuContent testId="content">
            <DropdownMenuItem testId="command">Command</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ThemeProvider>
    )
    root.renderer.flush()
    click(root, "command")
    expect(requests).toEqual([true, false])
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })

  test("disabled roots and triggers never open by pointer or keyboard", () => {
    for (const rootDisabled of [false, true]) {
      const requests: boolean[] = []
      const root = mount(
        <DropdownMenu
          disabled={rootDisabled}
          onOpenChange={value => {
            requests.push(value)
          }}
        >
          <DropdownMenuTrigger disabled={!rootDisabled} testId="trigger" style={triggerStyle}>
            Unavailable
          </DropdownMenuTrigger>
          <DropdownMenuContent testId="content">
            <DropdownMenuItem>Command</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
      click(root, "trigger")
      press(root, "trigger", "enter")
      press(root, "trigger", "space")
      expect(requests).toEqual([])
      expect(root.renderer.findByTestId("content")).toBeUndefined()
    }
  })

  test("only outside mouse-down dismisses; trigger toggles without reopening", () => {
    const root = mount(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
          Commands
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <ContextMenuLabel testId="label">Label</ContextMenuLabel>
          <DropdownMenuItem>Command</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    click(root, "label")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.nativeSimulateMouseMove(610, 370)
    expect(root.renderer.findByTestId("content")).toBeDefined()
    click(root, "trigger")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    click(root, "trigger")
    root.renderer.nativeSimulateMouseDown(610, 370)
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
  })

  test("submenus open right, close left/Escape one level, and keep parents alive until selection", () => {
    let selections = 0
    const root = mount(
      <DropdownMenu>
        <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
          Commands
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="parent">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger asChild>
              <div testId="sub-trigger">More</div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent testId="child">
              <DropdownMenuItem disabled testId="sub-disabled">
                Unavailable
              </DropdownMenuItem>
              <DropdownMenuItem
                testId="sub-item"
                onSelect={() => {
                  selections += 1
                }}
              >
                Nested command
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    press(root, "trigger", "enter")
    press(root, "sub-trigger", "right")
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "sub-item").id)
    press(root, "sub-item", "escape")
    expect(root.renderer.findByTestId("child")).toBeUndefined()
    expect(root.renderer.findByTestId("parent")).toBeDefined()
    expect(root.renderer.getFocusedElementId()).toBe(element(root, "sub-trigger").id)
    press(root, "sub-trigger", "right")
    press(root, "sub-item", "left")
    expect(root.renderer.findByTestId("child")).toBeUndefined()
    expect(root.renderer.findByTestId("parent")).toBeDefined()
    press(root, "sub-trigger", "right")
    const child = bounds(root, "child")
    root.renderer.nativeSimulateMouseDown(child.x + 1, child.y + 1)
    expect(root.renderer.findByTestId("parent")).toBeDefined()
    expect(root.renderer.findByTestId("child")).toBeDefined()
    root.renderer.nativeSimulateMouseUp(child.x + 1, child.y + 1)
    const box = bounds(root, "sub-item")
    root.renderer.nativeSimulateMouseDown(box.x + box.width / 2, box.y + box.height / 2)
    expect(root.renderer.findByTestId("parent")).toBeDefined()
    expect(root.renderer.findByTestId("child")).toBeDefined()
    root.renderer.nativeSimulateMouseUp(box.x + box.width / 2, box.y + box.height / 2)
    expect(selections).toBe(1)
    expect(root.renderer.findByTestId("parent")).toBeUndefined()
    expect(root.renderer.findByTestId("child")).toBeUndefined()
  })

  test("outside presses dismiss the complete nested menu tree", () => {
    const root = mount(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
          Commands
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="parent">
          <DropdownMenuSub defaultOpen>
            <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent testId="child">
              <DropdownMenuItem>Nested</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    expect(root.renderer.findByTestId("child")).toBeDefined()
    root.renderer.nativeSimulateMouseDown(610, 370)
    expect(root.renderer.findByTestId("parent")).toBeUndefined()
    expect(root.renderer.findByTestId("child")).toBeUndefined()
    root.renderer.nativeSimulateMouseUp(610, 370)
  })

  test("checkbox items notify their controlled owner and close", () => {
    const changes: boolean[] = []
    function Harness() {
      const [checked, setChecked] = useState(false)
      return (
        <DropdownMenu>
          <DropdownMenuTrigger testId="trigger" style={triggerStyle}>
            Options
          </DropdownMenuTrigger>
          <DropdownMenuContent testId="content">
            <DropdownMenuCheckboxItem
              testId="checkbox"
              checked={checked}
              onCheckedChange={value => {
                changes.push(value)
                setChecked(value)
              }}
            >
              Enabled
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
    const root = mount(<Harness />)
    click(root, "trigger")
    press(root, "checkbox", "space")
    expect(changes).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    click(root, "trigger")
    click(root, "checkbox")
    expect(changes).toEqual([true, false])
  })

  test("context triggers ignore primary clicks and anchor right/Ctrl-click at the pointer", () => {
    const root = mount(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div testId="trigger" style={{ width: 300, height: 160 }}>
            Surface
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent testId="content" sideOffset={0}>
          <ContextMenuItem>Command</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
    click(root, "trigger")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    root.renderer.nativeSimulateClick(180, 90, 2)
    const box = bounds(root, "content")
    expect(box.x).toBeGreaterThanOrEqual(180)
    expect(box.x).toBeLessThanOrEqual(184)
    expect(box.y).toBeGreaterThanOrEqual(90)
    expect(box.y).toBeLessThanOrEqual(94)
    root.renderer.nativeSimulateMouseDown(610, 370)
    root.renderer.nativeSimulateMouseUp(610, 370)
    root.renderer.nativeSimulateClick(100, 60, 0, "ctrl")
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })

  test("context wrappers preserve composite child editing keys and focus", () => {
    let latestHeight = 70
    const childKeys: string[] = []
    function CompositeRow() {
      const [height, setHeight] = useState(70)
      return (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div testId="trigger" style={{ width: 300, height: 160 }}>
              <div
                testId="resizer"
                role="separator"
                tabIndex={0}
                style={{ width: 100, height }}
                onKeyDown={event => {
                  childKeys.push(event.key ?? "")
                  if (event.key === "up" || event.key === "down") {
                    latestHeight = height + (event.key === "up" ? -17 : 17)
                    setHeight(latestHeight)
                  }
                }}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent testId="content">
            <ContextMenuItem>Command</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )
    }
    const root = mount(<CompositeRow />)
    const child = element(root, "resizer")
    root.renderer.nativeSimulateKeystrokes(child.id, "up")
    expect(latestHeight).toBe(53)
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(child.id)
    for (const key of ["down", "left", "right", "enter", "space", "escape"]) {
      root.renderer.simulateKeystrokes(key)
      expect(root.renderer.findByTestId("content")).toBeUndefined()
      expect(root.renderer.getFocusedElementId()).toBe(child.id)
    }
    expect(latestHeight).toBe(70)
    expect(childKeys).toEqual(["up", "down", "left", "right", "enter", "space", "escape"])
    root.renderer.nativeSimulateKeystrokes(element(root, "trigger").id, "shift-f10")
    expect(root.renderer.findByTestId("content")).toBeDefined()
    root.renderer.simulateKeystrokes("escape")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  })

  test("context radio groups select real values rather than dropdown indices", () => {
    const changes: string[] = []
    function Harness() {
      const [value, setValue] = useState("first")
      return (
        <ContextMenu>
          <ContextMenuTrigger testId="trigger" style={triggerStyle}>
            Context
          </ContextMenuTrigger>
          <ContextMenuContent testId="content">
            <ContextMenuLabel>Mode</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup
              value={value}
              onValueChange={next => {
                changes.push(next)
                setValue(next)
              }}
            >
              <ContextMenuRadioItem value="first">First</ContextMenuRadioItem>
              <ContextMenuRadioItem testId="second" value="second">
                Second
              </ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      )
    }
    const root = mount(<Harness />)
    press(root, "trigger", "shift-f10")
    click(root, "second")
    expect(changes).toEqual(["second"])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    press(root, "trigger", "enter")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
    press(root, "trigger", "shift-f10")
    click(root, "second")
    expect(changes).toEqual(["second"])
  })

  test("floating surfaces fit small viewports even with oversized requested dimensions", () => {
    const root = mount(
      <DropdownMenu defaultOpen style={{ marginLeft: 240, marginTop: 170 }}>
        <DropdownMenuTrigger style={{ width: 40, height: 24 }}>Menu</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            testId="content"
            style={{ width: 1000, height: 1000 }}
            collisionPadding={8}
          >
            <DropdownMenuItem>Long command\nSecond line</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>,
      320,
      240
    )
    const box = bounds(root, "content")
    expect(box.width).toBeLessThanOrEqual(304)
    expect(box.height).toBeLessThanOrEqual(224)
    expect(box.x).toBeGreaterThanOrEqual(8)
    expect(box.y).toBeGreaterThanOrEqual(8)
    expect(box.x + box.width).toBeLessThanOrEqual(312)
    expect(box.y + box.height).toBeLessThanOrEqual(232)
  })
})
