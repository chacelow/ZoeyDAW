import { afterEach, describe, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Button } from "../Button"
import { DragPadNumber } from "../DragPad"

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "."

const roots: TestRoot[] = []

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
})

function mount(children: ReactNode) {
  const root = createTestRoot({ width: 640, height: 400 })
  roots.push(root)
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  return root
}

function click(root: TestRoot, testId: string, button = 0) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  const box = root.renderer.getElementBounds(node.id)
  if (!box) throw new Error(`Unpainted ${testId}`)
  root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2, button)
}

describe("native nested context-menu pointer ownership", () => {
  test("nested Button mouse-down does not swallow the context right click", () => {
    const childButtons: number[] = []
    const changes: boolean[] = []
    const root = mount(
      <ContextMenu
        onOpenChange={open => {
          changes.push(open)
        }}
      >
        <ContextMenuTrigger asChild>
          <div testId="trigger" style={{ width: 300, height: 160 }}>
            <Button
              testId="child"
              onMouseDown={event => {
                childButtons.push(event.button ?? -1)
              }}
            >
              Child action
            </Button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent testId="content">
          <ContextMenuItem>Command</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
    click(root, "child", 2)
    expect(childButtons).toEqual([2])
    expect(changes).toEqual([true])
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })

  test("nested numeric pad preserves its value and opens the context menu on right click", () => {
    const values: number[] = []
    const root = mount(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div testId="trigger" style={{ width: 300, height: 160 }}>
            <DragPadNumber
              testId="child"
              label="Nested number"
              value={120}
              min={0}
              max={300}
              step={1}
              onChange={value => {
                values.push(value)
              }}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent testId="content">
          <ContextMenuItem>Command</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
    click(root, "child", 2)
    expect(values).toEqual([])
    expect(root.renderer.findByTestId("content")).toBeDefined()
  })
})
