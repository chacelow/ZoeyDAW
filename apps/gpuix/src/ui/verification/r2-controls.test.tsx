import { TEST_INPUT_POLICY } from "../controls/DragPad/input-policy.test-fixture"
import { afterEach, expect, test } from "bun:test"
import { useState } from "react"
import type { ReactNode } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { hydrateProject, projectActions, useProjectState } from "@/project/adapters"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createTimelineKeyboard } from "@/project/sections/arrangement/timeline/keyboard/controller"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider } from "../controls/ControlEnvironment"
import { DragPadNumber } from "../controls/DragPad/DragPadNumber"
import {
  ContextMenu,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../controls/Menu"
import { Popover, PopoverContent, PopoverTrigger } from "../controls/Popover"
import { CollapseDivider } from "../panels/CollapseDivider"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

function mount(children: ReactNode) {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
  projectActions.seekBar(9)
  const clip = useProjectState.getState().document.tracks.flatMap(track => track.clips)[0]
  if (!clip) throw new Error("Missing keyboard fixture clip")
  projectActions.setEditingClip(clip.id)
  const keyboard = createTimelineKeyboard({ focus: () => "control", blurControl: () => {} })
  const received: string[] = []
  const root = createTestRoot({
    width: 640,
    height: 400,
    onKeyDown: event => {
      received.push(event.key ?? "")
      keyboard.down(event)
    },
  })
  cleanups.push(
    () => keyboard.dispose(),
    () => root.unmount()
  )
  root.render(<ThemeProvider>{children}</ThemeProvider>)
  root.renderer.flush()
  return { ...root, received, clipId: clip.id }
}

function element(root: TestRoot, testId: string) {
  const node = root.renderer.findByTestId(testId)
  if (!node) throw new Error(`Missing ${testId}`)
  return node
}

function menu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger testId="trigger">Commands</DropdownMenuTrigger>
      <DropdownMenuContent testId="menu">
        <DropdownMenuItem testId="first">First</DropdownMenuItem>
        <DropdownMenuItem testId="last">Last</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger testId="sub-trigger">More</DropdownMenuSubTrigger>
          <DropdownMenuSubContent testId="submenu">
            <DropdownMenuItem testId="sub-item">Nested</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

for (const key of ["home", "end", "up", "down", "escape", "left"]) {
  test(`UPA-05 menu consumes ${key} before the real timeline window owner`, () => {
    const root = mount(menu())
    root.renderer.nativeSimulateKeystrokes(element(root, "trigger").id, "enter")
    if (key === "left") {
      root.renderer.nativeSimulateKeystrokes(element(root, "sub-trigger").id, "right")
      expect(root.renderer.findByTestId("submenu")).toBeDefined()
    }
    root.received.length = 0
    const before = useProjectState.getState().session.position
    root.renderer.simulateKeystrokes(key)
    if (key === "home") expect(root.renderer.getFocusedElementId()).toBe(element(root, "first").id)
    if (key === "end")
      expect(root.renderer.getFocusedElementId()).toBe(element(root, "sub-trigger").id)
    if (key === "escape") {
      expect(root.renderer.findByTestId("menu")).toBeUndefined()
      expect(root.renderer.getFocusedElementId()).toBe(element(root, "trigger").id)
    }
    if (key === "left") {
      expect(root.renderer.findByTestId("submenu")).toBeUndefined()
      expect(root.renderer.findByTestId("menu")).toBeDefined()
    }
    expect(root.received).toEqual([])
    expect(useProjectState.getState().session.position).toEqual(before)
    expect(useProjectState.getState().session.editingClipId).toBe(root.clipId)
  })
}

for (const key of ["enter", "up", "down", "right"]) {
  test(`UPA-05 menu opening ${key} is not also a timeline command`, () => {
    const root = mount(menu())
    if (key === "right") {
      root.renderer.nativeSimulateKeystrokes(element(root, "trigger").id, "enter")
      root.received.length = 0
    }
    const before = useProjectState.getState().session.position
    root.renderer.nativeSimulateKeystrokes(
      element(root, key === "right" ? "sub-trigger" : "trigger").id,
      key
    )
    expect(root.renderer.findByTestId(key === "right" ? "submenu" : "menu")).toBeDefined()
    expect(root.received).toEqual([])
    expect(useProjectState.getState().session.position).toEqual(before)
  })
}

for (const key of ["home", "end", "up", "down"]) {
  test(`UPA-06 collapse divider consumes ${key} and leaves Space for playback`, () => {
    let expanded = false
    function Divider() {
      const [value, setValue] = useState(false)
      return (
        <CollapseDivider
          testId="divider"
          aria-label="Toggle fixed panel"
          formatAccessiblePixels={pixels => `${pixels} pixels`}
          expanded={value}
          expandedSize={160}
          onExpandedChange={next => {
            expanded = next
            setValue(next)
          }}
        />
      )
    }
    const root = mount(<Divider />)
    const before = useProjectState.getState().session.position
    root.renderer.nativeSimulateKeystrokes(element(root, "divider").id, key)
    expect(expanded).toBe(key === "home" || key === "up")
    expect(root.received).toEqual([])
    expect(useProjectState.getState().session.position).toEqual(before)
    expect(useProjectState.getState().session.editingClipId).toBe(root.clipId)
    root.renderer.simulateKeystrokes("space")
    expect(root.received).toEqual(["space"])
    expect(useProjectState.getState().session.playing).toBe(true)
  })
}

test("UPA-06 idle divider Escape reaches the window but an active drag Escape only rolls back", () => {
  let expanded = false
  function Divider() {
    const [value, setValue] = useState(false)
    return (
      <CollapseDivider
        testId="divider"
        aria-label="Toggle fixed panel"
        formatAccessiblePixels={pixels => `${pixels} pixels`}
        expanded={value}
        expandedSize={160}
        onExpandedChange={next => {
          expanded = next
          setValue(next)
        }}
      />
    )
  }
  const root = mount(<Divider />)
  const divider = element(root, "divider")
  const bounds = root.renderer.getElementBounds(divider.id)
  if (!bounds) throw new Error("Missing divider bounds")
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  root.renderer.nativeSimulateMouseDown(x, y)
  root.renderer.nativeSimulateMouseMove(x, y - 120, 0)
  expect(expanded).toBe(true)
  root.renderer.nativeSimulateKeystrokes(divider.id, "escape")
  expect(expanded).toBe(false)
  expect(root.received).toEqual([])
  expect(useProjectState.getState().session.editingClipId).toBe(root.clipId)
  root.renderer.nativeSimulateMouseUp(x, y - 120)
  root.renderer.nativeSimulateKeystrokes(divider.id, "escape")
  expect(root.received).toEqual(["escape"])
  expect(useProjectState.getState().session.editingClipId).toBeNull()
})

function padHost() {
  const listeners = new Set<(active: boolean) => void>()
  const cursor = { visible: true, x: 0, y: 0 }
  const values = { current: 120, gesture: "idle" }
  const environment = {
    inputPolicy: TEST_INPUT_POLICY,
    subscribeWindowActive(listener: (active: boolean) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    cursorLock: {
      capture: (point: { x: number; y: number }) => point,
      hide: () => {
        cursor.visible = false
      },
      restore: (point: { x: number; y: number }) => {
        Object.assign(cursor, point, { visible: true })
      },
    },
  }
  function Pad() {
    const [value, setValue] = useState(120)
    return (
      <ControlEnvironmentProvider value={environment}>
        <div style={{ padding: 80 }}>
          <DragPadNumber
            testId="pad"
            label="BPM"
            value={value}
            min={20}
            max={300}
            step={1}
            onChange={next => {
              values.current = next
              setValue(next)
            }}
            onGestureStart={() => {
              values.gesture = "started"
            }}
            onGestureEnd={() => {
              values.gesture = "ended"
            }}
            onGestureCancel={() => {
              values.gesture = "cancelled"
            }}
          />
        </div>
      </ControlEnvironmentProvider>
    )
  }
  const root = mount(<Pad />)
  const bounds = root.renderer.getElementBounds(element(root, "pad").id)
  if (!bounds) throw new Error("Pad has no native bounds")
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const deactivate = () =>
    flushSync(() => {
      for (const listener of listeners) listener(false)
    })
  const drag = () => {
    root.renderer.nativeSimulateMouseDown(x, y)
    root.renderer.nativeSimulateMouseMove(x, y - 40, 0)
    expect(values.current).toBe(130)
    expect(cursor.visible).toBe(false)
  }
  return { ...root, values, cursor, listeners, x, y, deactivate, drag }
}

test("UPA-04 window deactivation rolls back the value and releases the cursor before mouseup", () => {
  const root = padHost()
  root.drag()
  root.deactivate()
  expect(root.values.current).toBe(120)
  expect(root.values.gesture).toBe("cancelled")
  expect(root.cursor).toEqual({ x: root.x, y: root.y, visible: true })
  root.renderer.nativeSimulateMouseMove(root.x, root.y - 80, 0)
  root.renderer.nativeSimulateMouseUp(root.x, root.y - 80)
  expect(root.values.current).toBe(120)
  expect(root.values.gesture).toBe("cancelled")
  root.unmount()
  expect(root.listeners.size).toBe(0)
})

test("UPA-07 DragPad Escape cancels only its gesture, not the open Clip Edit", () => {
  const root = padHost()
  root.drag()
  root.renderer.nativeSimulateKeystrokes(element(root, "pad").id, "escape")
  expect(root.values.current).toBe(120)
  expect(root.values.gesture).toBe("cancelled")
  expect(root.cursor.visible).toBe(true)
  expect(root.received).toEqual([])
  expect(useProjectState.getState().session.editingClipId).toBe(root.clipId)
  root.renderer.nativeSimulateMouseUp(root.x, root.y - 40)
  expect(root.values.gesture).toBe("cancelled")
  root.renderer.nativeSimulateKeystrokes(element(root, "pad").id, "space")
  expect(root.received).toEqual(["space"])
  expect(useProjectState.getState().session.playing).toBe(true)
})

test("UPA-07 idle DragPad Escape reaches the real window owner", () => {
  const root = padHost()
  root.renderer.nativeSimulateKeystrokes(element(root, "pad").id, "escape")
  expect(root.values.current).toBe(120)
  expect(root.values.gesture).toBe("idle")
  expect(root.received).toEqual(["escape"])
  expect(useProjectState.getState().session.editingClipId).toBeNull()
})

test("UPA-07 idle DragPad Escape closes its popup and restores the trigger focus", () => {
  const root = mount(
    <Popover>
      <PopoverTrigger testId="popup-trigger">Adjust</PopoverTrigger>
      <PopoverContent testId="popup">
        <DragPadNumber
          testId="popup-pad"
          label="Popup value"
          value={120}
          onChange={() => {}}
          min={20}
          max={300}
          step={1}
        />
      </PopoverContent>
    </Popover>
  )
  root.renderer.nativeSimulateKeystrokes(element(root, "popup-trigger").id, "enter")
  expect(root.renderer.findByTestId("popup")).toBeDefined()
  root.renderer.nativeSimulateKeystrokes(element(root, "popup-pad").id, "escape")
  expect(root.renderer.findByTestId("popup")).toBeUndefined()
  expect(root.renderer.getFocusedElementId()).toBe(element(root, "popup-trigger").id)
})

test("ARR-05 ContextMenuTrigger preserves an editing surface's explicit Tab exclusion", () => {
  const root = mount(
    <div>
      <div role="button" tabIndex={0} testId="before">
        Before
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild tabIndex={-1}>
          <div testId="excluded">Editing surface child</div>
        </ContextMenuTrigger>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div testId="default-trigger">Default menu entry</div>
        </ContextMenuTrigger>
      </ContextMenu>
    </div>
  )
  expect(root.renderer.getElement(element(root, "excluded").id)?.customProps?.tabIndex).toBe(-1)
  expect(root.renderer.getElement(element(root, "default-trigger").id)?.customProps?.tabIndex).toBe(
    0
  )
  root.renderer.nativeSimulateKeystrokes(element(root, "before").id, "tab")
  expect(root.renderer.getFocusedElementId()).toBe(element(root, "default-trigger").id)
})
