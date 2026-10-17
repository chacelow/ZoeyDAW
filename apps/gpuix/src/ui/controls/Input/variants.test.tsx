import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Chip } from "../Chip"
import { Icon } from "../Icon"
import { Input, InlineEdit } from "."
import type { InputVariant } from "."

const variants: readonly InputVariant[] = ["outline", "filled", "ghost", "borderless", "underline"]

test("Input variants keep border geometry and metric heights", () => {
  const root = createTestRoot({ width: 400, height: 240 })
  let unit = 0
  let transport = 0
  let border = 0
  function Form() {
    const theme = useTheme()
    unit = theme.control["--spacing-control-track"]
    transport = theme.transportControl["--spacing-control-track"]
    border = theme.design.shape.controlBorderWidth
    return (
      <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
        {variants.map(variant => <div key={variant} style={{ display: "flex", flexDirection: "column" }}>
          <div testId={`${variant}-before`} style={{ height: 1 }} />
          <Input testId={variant} variant={variant} value="Name" />
          <div testId={`${variant}-after`} style={{ height: 1 }} />
        </div>)}
        <div testId="transport-before" style={{ height: 1 }} />
        <Input testId="transport" size="transport" value="Name" />
        <div testId="transport-after" style={{ height: 1 }} />
        <div testId="small-before" style={{ height: 1 }} />
        <Input testId="small" size="small" value="Name" />
        <div testId="small-after" style={{ height: 1 }} />
      </div>
    )
  }
  try {
    root.render(<ThemeProvider><Form /></ThemeProvider>)
    root.renderer.flush()
    for (const variant of variants) {
      const node = root.renderer.findByTestId(variant)
      if (!node) throw new Error(`Missing ${variant}`)
      expect(root.renderer.getElement(node.id)?.style.borderWidth).toBe(variant === "outline" ? border : 0)
      expect(root.renderer.getElement(node.id)?.style.borderBottomWidth ?? 0).toBe(variant === "underline" ? border : 0)
      const before = root.renderer.findByTestId(`${variant}-before`)
      const after = root.renderer.findByTestId(`${variant}-after`)
      const start = before && root.renderer.getElementBounds(before.id)
      const end = after && root.renderer.getElementBounds(after.id)
      if (!start || !end) throw new Error(`Missing ${variant} layout markers`)
      expect(end.y - start.y - start.height).toBe(unit)
    }
    const large = root.renderer.findByTestId("transport")
    const small = root.renderer.findByTestId("small")
    if (!large || !small) throw new Error("Missing size examples")
    for (const [id, expected] of [["transport", transport], ["small", unit]] as const) {
      const before = root.renderer.findByTestId(`${id}-before`)
      const after = root.renderer.findByTestId(`${id}-after`)
      const start = before && root.renderer.getElementBounds(before.id)
      const end = after && root.renderer.getElementBounds(after.id)
      if (!start || !end) throw new Error(`Missing ${id} layout markers`)
      expect(end.y - start.y - start.height).toBe(expected)
    }
  } finally {
    root.unmount()
  }
})

test("clearable Input clears through both change APIs and restores input focus", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  const changes: string[] = []
  function Form() {
    const [value, setValue] = useState("Drums")
    return <Input testId="search" aria-label="Search" leading={<Icon name="Search" />} clearable clearLabel="Clear search" value={value} onValueChange={setValue} onChange={event => { changes.push(event.value ?? "") }} style={{ width: 240 }} />
  }
  try {
    root.render(<ThemeProvider><Form /></ThemeProvider>)
    root.renderer.flush()
    const input = root.renderer.findByTestId("search")
    const clear = root.renderer.findByTestId("search-clear")
    if (!input || !clear) throw new Error("Missing search controls")
    root.renderer.focusElement(input.id)
    const bounds = root.renderer.getElementBounds(clear.id)
    if (!bounds) throw new Error("Unpainted clear control")
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    root.renderer.nativeSimulateMouseMove(x, y)
    root.renderer.nativeSimulateClick(x, y)
    expect(root.renderer.getElement(input.id)?.customProps?.value).toBe("")
    expect(changes).toEqual([""])
    expect(root.renderer.getFocusedElementId()).toBe(input.id)
    root.renderer.simulateKeystrokes("x")
    expect(root.renderer.getElement(input.id)?.customProps?.value).toBe("x")
  } finally {
    root.unmount()
  }
})

test("InlineEdit Enter commits once and Escape restores the committed name", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  const commits: string[] = []
  function Form() {
    const [value, setValue] = useState("Track")
    return <InlineEdit testId="name" value={value} onCommit={next => { commits.push(next); setValue(next) }} style={{ width: 240 }} />
  }
  try {
    root.render(<ThemeProvider><Form /></ThemeProvider>)
    const display = root.renderer.findByTestId("name")
    if (!display) throw new Error("Missing inline name")
    root.renderer.nativeSimulateKeystrokes(display.id, "enter")
    root.renderer.simulateKeystrokes("x enter")
    expect(commits).toEqual(["x"])
    const committed = root.renderer.findByTestId("name")
    if (!committed) throw new Error("Missing committed name")
    expect(root.renderer.getFocusedElementId()).toBe(committed.id)
    root.renderer.simulateKeystrokes("f2")
    root.renderer.simulateKeystrokes("y escape")
    expect(commits).toEqual(["x"])
    expect(root.renderer.getAllText()).toContain("x")
    expect(root.renderer.getAllText()).not.toContain("y")
    const restored = root.renderer.findByTestId("name")
    if (!restored) throw new Error("Missing restored name")
    root.renderer.nativeSimulateKeystrokes(restored.id, "enter")
    const editor = root.renderer.findByTestId("name")
    if (!editor) throw new Error("Missing inline editor")
    expect(root.renderer.getElement(editor.id)?.customProps?.value).toBe("x")
  } finally {
    root.unmount()
  }
})

test("read-only inputs reject native typing across variants", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  const changes: string[] = []
  try {
    root.render(
      <ThemeProvider>
        <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
          {variants.map(variant => <Input key={variant} testId={variant} variant={variant} readOnly value="Fixed" onValueChange={value => { changes.push(value) }} />)}
        </div>
      </ThemeProvider>
    )
    for (const variant of variants) {
      const node = root.renderer.findByTestId(variant)
      if (!node) throw new Error(`Missing ${variant}`)
      root.renderer.nativeSimulateKeystrokes(node.id, "x space backspace")
      expect(root.renderer.getFocusedElementId()).toBe(node.id)
      expect(root.renderer.getElement(node.id)?.customProps?.readOnly).toBe(true)
      expect(root.renderer.getElement(node.id)?.customProps?.theme).toMatchObject({ caret: "transparent" })
      expect(root.renderer.getElement(node.id)?.style.cursor).toBe("default")
      expect(root.renderer.getElement(node.id)?.customProps?.value).toBe("Fixed")
    }
    expect(changes).toEqual([])
  } finally {
    root.unmount()
  }
})

test("disabled inputs never focus or select on native click across variants", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  let disabledCursor: unknown
  function Form() {
    const theme = useTheme()
    disabledCursor = theme.design.cursors.disabled
    return <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
      <Input testId="editable" value="Edit" />
      {variants.map(variant => <Input key={variant} testId={variant} variant={variant} disabled autoFocus value="Fixed" />)}
    </div>
  }
  try {
    root.render(<ThemeProvider><Form /></ThemeProvider>)
    root.renderer.flush()
    const editable = root.renderer.findByTestId("editable")!
    root.renderer.focusElement(editable.id)
    expect(editable.style.cursor).toBe("text")
    for (const variant of variants) {
      const node = root.renderer.findByTestId(variant)!
      const bounds = root.renderer.getElementBounds(node.id)!
      const x = bounds.x + bounds.width / 2
      const y = bounds.y + bounds.height / 2
      root.renderer.nativeSimulateMouseMove(x, y)
      root.renderer.nativeSimulateClick(x, y)
      expect(root.renderer.getFocusedElementId(), variant).toBe(editable.id)
      expect(node.customProps?.readOnly).toBe(true)
      expect(node.style.pointerEvents).toBe("none")
      expect(node.style.focusVisible).toBeUndefined()
      expect(root.renderer.getElement(node.parentId!)?.style.cursor).toBe(disabledCursor)
    }
  } finally { root.unmount() }
})

test("Chip shares the control radius and one-unit height", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let radius = 0
  let unit = 0
  function Form() {
    const theme = useTheme()
    radius = theme.design.shape.controlRadius
    unit = theme.control["--spacing-control-track"]
    return <Chip testId="chip" remove={{ label: "Remove", onRemove: () => {} }}>Drums</Chip>
  }
  try {
    root.render(<ThemeProvider><Form /></ThemeProvider>)
    const chip = root.renderer.findByTestId("chip")
    if (!chip) throw new Error("Missing chip")
    expect(root.renderer.getElement(chip.id)?.style.borderRadius).toBe(radius)
    expect(root.renderer.getElementBounds(chip.id)?.height).toBe(unit)
  } finally {
    root.unmount()
  }
})
