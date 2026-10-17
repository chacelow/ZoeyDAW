import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import {
  ContextMenuOptionGrid,
  ContextMenuOptionGridItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

function mount(children: ReactNode) {
  const root = createTestRoot({ width: 640, height: 400 })
  roots.push(root)
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  return root
}

function node(root: TestRoot, testId: string) {
  const element = root.renderer.findByTestId(testId)
  if (!element) throw new Error(`Missing ${testId}`)
  return element
}

function press(root: TestRoot, testId: string, key: string) {
  root.renderer.nativeSimulateKeyDown(node(root, testId).id, key)
}

function click(root: TestRoot, testId: string) {
  const box = root.renderer.getElementBounds(node(root, testId).id)
  if (!box) throw new Error(`Unpainted ${testId}`)
  root.renderer.nativeSimulateClick(box.x + box.width / 2, box.y + box.height / 2)
}

test("grid click selects once, closes, and exposes the selected radio when reopened", () => {
  const changes: string[] = []
  function Harness() {
    const [value, setValue] = useState("a")
    return (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger testId="trigger">Grid</DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <ContextMenuOptionGrid columns={3} value={value} onValueChange={next => {
            changes.push(next)
            setValue(next)
          }}>
            <ContextMenuOptionGridItem testId="a" value="a">Alpha</ContextMenuOptionGridItem>
            <ContextMenuOptionGridItem testId="b" value="b">Beta</ContextMenuOptionGridItem>
          </ContextMenuOptionGrid>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
  const root = mount(<Harness />)
  expect(node(root, "a").customProps?.["role"]).toBe("menuitemradio")
  expect(node(root, "a").customProps?.["aria-checked"]).toBe(true)
  expect(node(root, "b").customProps?.["aria-checked"]).toBe(false)
  click(root, "b")
  expect(changes).toEqual(["b"])
  expect(root.renderer.findByTestId("content")).toBeUndefined()
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "trigger").id)
  press(root, "trigger", "enter")
  expect(node(root, "a").customProps?.["aria-checked"]).toBe(false)
  expect(node(root, "b").customProps?.["aria-checked"]).toBe(true)
})

test("array options register in linear navigation and select with Enter and Space", () => {
  for (const key of ["enter", "space"]) {
    const changes: string[] = []
    const root = mount(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger testId="trigger">Grid</DropdownMenuTrigger>
        <DropdownMenuContent testId="content">
          <ContextMenuOptionGrid columns={3} value="a" onValueChange={value => {
            changes.push(value)
          }} options={[
            { id: "a", label: "Alpha" },
            { id: "disabled", label: "Disabled", disabled: true },
            { id: "b", label: "Beta" },
          ]} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const alpha = root.renderer.findByType("div").find(element => element.customProps?.["aria-label"] === "Alpha")
    const beta = root.renderer.findByType("div").find(element => element.customProps?.["aria-label"] === "Beta")
    if (!alpha || !beta) throw new Error("Missing array menu entries")
    root.renderer.nativeSimulateKeyDown(alpha.id, "down")
    expect(root.renderer.getFocusedElementId()).toBe(beta.id)
    root.renderer.nativeSimulateKeyDown(beta.id, key)
    expect(changes).toEqual(["b"])
    expect(root.renderer.findByTestId("content")).toBeUndefined()
  }
})

test("Left and Right stay in the grid row, skip disabled cells, and do not close its submenu", () => {
  const root = mount(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Commands</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger testId="sub">Grid</DropdownMenuSubTrigger>
          <DropdownMenuSubContent testId="submenu">
            <ContextMenuOptionGrid columns={3} value="a">
              <ContextMenuOptionGridItem testId="a" value="a">Alpha</ContextMenuOptionGridItem>
              <ContextMenuOptionGridItem testId="disabled" value="disabled" disabled>Disabled</ContextMenuOptionGridItem>
              <ContextMenuOptionGridItem testId="c" value="c">Gamma</ContextMenuOptionGridItem>
              <ContextMenuOptionGridItem testId="d" value="d">Delta</ContextMenuOptionGridItem>
            </ContextMenuOptionGrid>
            <DropdownMenuItem testId="ordinary">Ordinary</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  press(root, "sub", "right")
  press(root, "a", "right")
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "c").id)
  press(root, "c", "right")
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "c").id)
  press(root, "c", "left")
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "a").id)
  press(root, "a", "left")
  expect(root.renderer.findByTestId("submenu")).toBeDefined()
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "a").id)
  press(root, "a", "down")
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "c").id)
  press(root, "c", "down")
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "d").id)
  press(root, "d", "down")
  press(root, "ordinary", "left")
  expect(root.renderer.findByTestId("submenu")).toBeUndefined()
  expect(root.renderer.getFocusedElementId()).toBe(node(root, "sub").id)
})

test("shortcuts stay right-aligned and separators span the surface inner border box", () => {
  const root = mount(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Commands</DropdownMenuTrigger>
      <DropdownMenuContent testId="surface">
        <DropdownMenuItem testId="rename" shortcut="Ctrl+R">Rename</DropdownMenuItem>
        <DropdownMenuSeparator testId="separator" />
        <DropdownMenuItem testId="duplicate" shortcut="Ctrl+D">Duplicate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const surface = node(root, "surface")
  const surfaceBounds = root.renderer.getElementBounds(surface.id)!
  const separator = root.renderer.getElementBounds(node(root, "separator").id)!
  const border = surface.style.borderWidth
  if (typeof border !== "number") throw new Error("Missing surface border")
  expect(separator.x).toBeCloseTo(surfaceBounds.x + border)
  expect(separator.width).toBeCloseTo(surfaceBounds.width - border * 2)
  const renameShortcut = root.renderer.findByText("Ctrl+R")
  const duplicateShortcut = root.renderer.findByText("Ctrl+D")
  if (!renameShortcut || !duplicateShortcut) throw new Error("Missing shortcuts")
  const renameBounds = root.renderer.getElementBounds(renameShortcut.id)!
  const duplicateBounds = root.renderer.getElementBounds(duplicateShortcut.id)!
  expect(renameBounds.x + renameBounds.width).toBeCloseTo(duplicateBounds.x + duplicateBounds.width)
})
