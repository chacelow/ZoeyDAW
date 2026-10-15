import { afterEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "../Button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "."

const roots: TestRoot[] = []

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
})

function mount(children: ReactNode, windowSpaces: boolean[] = []) {
  const root = createTestRoot({
    width: 640,
    height: 400,
    onKeyDown: event => {
      if (event.key === "space") windowSpaces.push(event.defaultPrevented)
    },
  })
  roots.push(root)
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  return root
}

function element(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  return node
}

describe("native menu interaction ownership", () => {
  for (const context of [false, true]) {
    for (const asChild of [false, true]) {
      test(`${context ? "context" : "dropdown"} ${asChild ? "Button slot" : "plain"} trigger Space reaches window after Escape`, () => {
        const spaces: boolean[] = []
        const Root = context ? ContextMenu : DropdownMenu
        const Trigger = context ? ContextMenuTrigger : DropdownMenuTrigger
        const Content = context ? ContextMenuContent : DropdownMenuContent
        const Item = context ? ContextMenuItem : DropdownMenuItem
        const root = mount(
          <Root>
            <Trigger asChild={asChild} testId="trigger">
              {asChild ? <Button testId="trigger">Commands</Button> : "Commands"}
            </Trigger>
            <Content testId="content">
              <Item testId="item">Command</Item>
            </Content>
          </Root>,
          spaces
        )
        root.renderer.nativeSimulateKeystrokes(
          element(root, "trigger").id,
          context ? "shift-f10" : "enter"
        )
        expect(root.renderer.findByTestId("content")).toBeDefined()
        root.renderer.simulateKeystrokes("escape")
        expect(root.renderer.findByTestId("content")).toBeUndefined()
        expect(root.renderer.getFocusedElementId()).toBe(element(root, "trigger").id)
        root.renderer.simulateKeystrokes("space")
        expect(root.renderer.findByTestId("content")).toBeUndefined()
        expect(spaces).toEqual([false])
      })
    }

    test(`${context ? "context" : "dropdown"} item Space selects once, consumes and restores focus`, () => {
      const spaces: boolean[] = []
      const selected: string[] = []
      const Root = context ? ContextMenu : DropdownMenu
      const Trigger = context ? ContextMenuTrigger : DropdownMenuTrigger
      const Content = context ? ContextMenuContent : DropdownMenuContent
      const Item = context ? ContextMenuItem : DropdownMenuItem
      const root = mount(
        <Root>
          <Trigger testId="trigger">Commands</Trigger>
          <Content testId="content">
            <Item
              testId="item"
              onSelect={() => {
                selected.push("select")
              }}
              onClick={() => {
                selected.push("click")
              }}
            >
              Command
            </Item>
          </Content>
        </Root>,
        spaces
      )
      root.renderer.nativeSimulateKeystrokes(
        element(root, "trigger").id,
        context ? "shift-f10" : "enter"
      )
      expect(root.renderer.getFocusedElementId()).toBe(element(root, "item").id)
      root.renderer.simulateKeystrokes("space")
      expect(selected).toEqual(["select", "click"])
      expect(root.renderer.findByTestId("content")).toBeUndefined()
      expect(root.renderer.getFocusedElementId()).toBe(element(root, "trigger").id)
      expect(spaces).toEqual([])
    })
  }
})

test("Enter on a nested control does not activate its dropdown ancestor", () => {
  let childActions = 0
  const root = mount(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div testId="trigger" style={{ width: 300, height: 100 }}>
          <Button
            testId="child"
            onClick={() => {
              childActions += 1
            }}
          >
            Solo
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent testId="content">
        <DropdownMenuItem>Command</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  root.renderer.nativeSimulateKeystrokes(element(root, "child").id, "enter")
  expect(childActions).toBe(1)
  expect(root.renderer.findByTestId("content")).toBeUndefined()
  expect(root.renderer.getFocusedElementId()).toBe(element(root, "child").id)
})

for (const asChild of [false, true]) {
  test(`prevented Enter never activates a ${asChild ? "Button slot" : "plain"} menu trigger`, () => {
    const root = mount(
      <DropdownMenu>
        <DropdownMenuTrigger
          testId="trigger"
          asChild={asChild}
          onKeyDown={event => event.preventDefault()}
        >
          {asChild ? <Button>Commands</Button> : "Commands"}
        </DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <DropdownMenuItem>Command</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    root.renderer.nativeSimulateKeystrokes(element(root, "trigger").id, "enter")
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  })
}
