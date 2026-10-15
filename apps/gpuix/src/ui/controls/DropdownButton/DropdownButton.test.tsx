import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync, Select, SelectContent, SelectItem, SelectTrigger } from "@gpuix/react"
import type { SelectTriggerProps } from "@gpuix/react"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DropdownButton } from "."

test("SDK SelectTrigger activates on Space by default and menu Space still selects", () => {
  const root = createTestRoot({ width: 480, height: 320 })
  const openings: boolean[] = []
  const changes: string[] = []
  try {
    root.render(
      <Select
        defaultValue="a"
        onOpenChange={open => {
          openings.push(open)
        }}
        onValueChange={value => {
          changes.push(value)
        }}
      >
        <SelectTrigger testId="sdk-trigger">Mode</SelectTrigger>
        <SelectContent testId="sdk-content">
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>
    )
    root.renderer.flush()
    const trigger = root.renderer.findByTestId("sdk-trigger")!
    expect(root.renderer.findByTestId("sdk-content")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(trigger.id, "space")
    expect(openings).toEqual([true])
    const content = root.renderer.findByTestId("sdk-content")!
    expect(content).toBeDefined()
    root.renderer.nativeSimulateKeystrokes(content.id, "down")
    root.renderer.nativeSimulateKeystrokes(content.id, "space")
    expect(changes).toEqual(["b"])
    expect(openings).toEqual([true, false])
    expect(root.renderer.findByTestId("sdk-content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
  } finally {
    root.unmount()
  }
})

test("SDK SelectTrigger can leave Space to the window while Enter still opens", () => {
  const received: { key: string; defaultPrevented: boolean }[] = []
  const openings: boolean[] = []
  const root = createTestRoot({
    width: 480,
    height: 320,
    onKeyDown: event => {
      received.push({
        key: event.key ?? "",
        defaultPrevented: event.defaultPrevented,
      })
    },
  })
  const triggerProps = { activateOnSpace: false } satisfies SelectTriggerProps
  try {
    root.render(
      <Select
        defaultValue="a"
        onOpenChange={open => {
          openings.push(open)
        }}
      >
        <SelectTrigger {...triggerProps} testId="sdk-trigger">
          Mode
        </SelectTrigger>
        <SelectContent testId="sdk-content">
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>
    )
    root.renderer.flush()
    const trigger = root.renderer.findByTestId("sdk-trigger")!
    root.renderer.nativeSimulateKeystrokes(trigger.id, "space")
    expect(received).toEqual([{ key: "space", defaultPrevented: false }])
    expect(openings).toEqual([])
    expect(root.renderer.findByTestId("sdk-content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    expect(openings).toEqual([true])
    expect(root.renderer.findByTestId("sdk-content")).toBeDefined()
  } finally {
    root.unmount()
  }
})

test("SDK SelectTrigger honors caller preventDefault before built-in activation", () => {
  for (const key of ["space", "enter"]) {
    const callerKeys: string[] = []
    const rootKeys: { key: string; defaultPrevented: boolean }[] = []
    const openings: boolean[] = []
    const root = createTestRoot({
      width: 480,
      height: 320,
      onKeyDown: event => {
        rootKeys.push({
          key: event.key ?? "",
          defaultPrevented: event.defaultPrevented,
        })
      },
    })
    try {
      root.render(
        <Select
          defaultValue="a"
          onOpenChange={open => {
            openings.push(open)
          }}
        >
          <SelectTrigger
            testId="sdk-trigger"
            onKeyDown={event => {
              callerKeys.push(event.key ?? "")
              event.preventDefault()
            }}
          >
            Mode
          </SelectTrigger>
          <SelectContent testId="sdk-content">
            <SelectItem value="a">Alpha</SelectItem>
          </SelectContent>
        </Select>
      )
      root.renderer.flush()
      const trigger = root.renderer.findByTestId("sdk-trigger")!
      root.renderer.nativeSimulateKeystrokes(trigger.id, key)
      expect(callerKeys).toEqual([key])
      expect(rootKeys).toEqual([{ key, defaultPrevented: true }])
      expect(openings).toEqual([])
      expect(root.renderer.findByTestId("sdk-content")).toBeUndefined()
      expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
    } finally {
      root.unmount()
    }
  }
})

test("DropdownButton leaves Space to playback and retains Enter and menu Space", () => {
  const received: { key: string; defaultPrevented: boolean }[] = []
  const changes: string[] = []
  const root = createTestRoot({
    width: 480,
    height: 320,
    onKeyDown: event => {
      received.push({
        key: event.key ?? "",
        defaultPrevented: event.defaultPrevented,
      })
    },
  })
  try {
    root.render(
      <ThemeProvider>
        <DropdownButton
          testId="toolbar-select"
          label="Mode"
          value="a"
          onChange={value => {
            changes.push(value)
          }}
          items={[
            { id: "a", label: "Alpha" },
            { id: "b", label: "Beta" },
          ]}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const trigger = root.renderer.findByTestId("toolbar-select")!
    root.renderer.nativeSimulateKeystrokes(trigger.id, "space")
    expect(received).toEqual([{ key: "space", defaultPrevented: false }])
    expect(changes).toEqual([])
    expect(root.renderer.findByTestId("toolbar-select-content")).toBeUndefined()
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    const content = root.renderer.findByTestId("toolbar-select-content")!
    expect(content).toBeDefined()
    received.length = 0
    root.renderer.nativeSimulateKeystrokes(content.id, "down")
    root.renderer.nativeSimulateKeystrokes(content.id, "space")
    expect(changes).toEqual(["b"])
    expect(root.renderer.findByTestId("toolbar-select-content")).toBeUndefined()
    expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
    expect(received.filter(event => event.key === "space")).toEqual([])
  } finally {
    root.unmount()
  }
})

test("native select skips disabled options and selects once by keyboard", () => {
  const root = createTestRoot({ width: 480, height: 320 })
  const changes: string[] = []
  function Harness() {
    const [value, setValue] = useState("a")
    return (
      <ThemeProvider>
        <div style={{ padding: 80 }}>
          <DropdownButton
            testId="select"
            label="Mode"
            value={value}
            onChange={next => {
              changes.push(next)
              setValue(next)
            }}
            items={[
              { id: "a", label: "Alpha" },
              { id: "b", label: "Disabled", disabled: true },
              { id: "c", label: "Two lines\nEnabled option" },
            ]}
          />
        </div>
      </ThemeProvider>
    )
  }
  root.render(<Harness />)
  root.renderer.flush()
  const trigger = root.renderer.findByTestId("select")!
  root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
  root.renderer.simulateKeystrokes("down")
  root.renderer.simulateKeystrokes("enter")
  expect(changes).toEqual(["c"])
  expect(root.renderer.getFocusedElementId()).toBe(trigger.id)
  root.unmount()
})

test("centered native Select anchors to the compact trigger rather than a stretched parent", async () => {
  const root = createTestRoot({ width: 640, height: 400 })
  root.render(
    <ThemeProvider>
      <div style={{ marginLeft: 250, marginTop: 160 }}>
        <DropdownButton
          testId="center"
          label="Mode"
          value="a"
          onChange={() => {}}
          align="center"
          items={[
            { id: "a", label: "Alpha" },
            { id: "b", label: "Two lines\nEnabled option" },
          ]}
        />
      </div>
    </ThemeProvider>
  )
  root.renderer.flush()
  root.renderer.nativeSimulateKeystrokes(root.renderer.findByTestId("center")!.id, "enter")
  for (let attempt = 0; attempt < 20; attempt++) {
    await Bun.sleep(10)
    flushSync(() => {})
    root.renderer.flush()
    const trigger = root.renderer.getElementBounds(root.renderer.findByTestId("center")!.id)!
    const content = root.renderer.getElementBounds(
      root.renderer.findByTestId("center-content")!.id
    )!
    if (Math.abs(content.x + content.width / 2 - trigger.x - trigger.width / 2) <= 0.5) break
  }
  const trigger = root.renderer.getElementBounds(root.renderer.findByTestId("center")!.id)!
  const content = root.renderer.getElementBounds(root.renderer.findByTestId("center-content")!.id)!
  // Native anchored positions snap to pixels; odd surface widths can differ by half a point.
  expect(
    Math.abs(content.x + content.width / 2 - trigger.x - trigger.width / 2)
  ).toBeLessThanOrEqual(0.5)
  expect(content.y).toBeGreaterThanOrEqual(trigger.y + trigger.height)
  root.unmount()
})

test("filled select owns the parent width and preserves anchored alignment", async () => {
  for (const [parentWidth, align] of [
    [74, "start"],
    [304, "center"],
  ] as const) {
    const root = createTestRoot({ width: 640, height: 400 })
    root.render(
      <ThemeProvider>
        <div testId="parent" style={{ width: parentWidth, marginLeft: 120, marginTop: 100 }}>
          <DropdownButton
            testId="fill"
            label="Filled mode"
            fill
            align={align}
            value="a"
            onChange={() => {}}
            items={[
              { id: "a", label: "Alpha" },
              { id: "b", label: "Long routing destination" },
            ]}
          />
        </div>
      </ThemeProvider>
    )
    root.renderer.flush()
    const parent = root.renderer.getElementBounds(root.renderer.findByTestId("parent")!.id)!
    const outer = root.renderer.getElementBounds(root.renderer.findByTestId("fill-root")!.id)!
    const trigger = root.renderer.getElementBounds(root.renderer.findByTestId("fill")!.id)!
    expect(outer.width).toBe(parent.width)
    expect(trigger.width).toBe(parent.width)
    root.renderer.nativeSimulateKeystrokes(root.renderer.findByTestId("fill")!.id, "enter")
    for (let attempt = 0; attempt < 20; attempt++) {
      await Bun.sleep(10)
      flushSync(() => {})
      root.renderer.flush()
      const content = root.renderer.getElementBounds(
        root.renderer.findByTestId("fill-content")!.id
      )!
      const delta =
        align === "center"
          ? content.x + content.width / 2 - trigger.x - trigger.width / 2
          : content.x - trigger.x
      if (Math.abs(delta) <= 0.5) break
    }
    const content = root.renderer.getElementBounds(root.renderer.findByTestId("fill-content")!.id)!
    expect(
      Math.abs(
        align === "center"
          ? content.x + content.width / 2 - trigger.x - trigger.width / 2
          : content.x - trigger.x
      )
    ).toBeLessThanOrEqual(0.5)
    expect(content.y).toBeGreaterThanOrEqual(trigger.y + trigger.height)
    root.unmount()
  }
})
