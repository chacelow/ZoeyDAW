import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { useState } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "../../../shared/theme/ThemeProvider"
import { Input } from "."

test("native editor commits event.value and preserves compact geometry while focused", () => {
  const root = createTestRoot({ width: 400, height: 180 })
  let latest = ""
  let height = 0
  function Form() {
    const [value, setValue] = useState("")
    height = useTheme().control["--spacing-control-track"]
    return (
      <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
        <div testId="before-input" style={{ height: 1 }} />
        <Input
          testId="input"
          value={value}
          onValueChange={next => {
            latest = next
            setValue(next)
          }}
        />
        <div testId="after-input" style={{ height: 1 }} />
      </div>
    )
  }
  root.render(
    <ThemeProvider>
      <Form />
    </ThemeProvider>
  )
  root.renderer.flush()
  const input = root.renderer.findByTestId("input")
  if (!input) throw new Error("Missing input")
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(input.id))
  const before = root.renderer.findByTestId("before-input")
  const after = root.renderer.findByTestId("after-input")
  if (!before || !after) throw new Error("Missing layout markers")
  const beforeBounds = readOuterBounds(root.renderer, root.renderer.getElement(before.id))
  const afterBounds = readOuterBounds(root.renderer, root.renderer.getElement(after.id))
  if (!beforeBounds || !afterBounds) throw new Error("Unpainted layout markers")
  expect(afterBounds.y - beforeBounds.y - beforeBounds.height).toBe(height)
  root.renderer.nativeSimulateKeystrokes(input.id, "a b c")
  expect(latest).toBe("abc")
  root.renderer.simulateKeystrokes("backspace")
  expect(latest).toBe("ab")
  expect(readOuterBounds(root.renderer, root.renderer.getElement(input.id))).toEqual(bounds)
  root.unmount()
})

test("disabled and read-only native editors reject text edits", () => {
  for (const mode of ["disabled", "readonly"]) {
    const root = createTestRoot({ width: 400, height: 180 })
    let changes = 0
    root.render(
      <ThemeProvider>
        <Input
          testId="input"
          value="fixed"
          disabled={mode === "disabled"}
          readOnly={mode === "readonly"}
          onValueChange={() => {
            changes += 1
          }}
        />
      </ThemeProvider>
    )
    root.renderer.flush()
    const input = root.renderer.findByTestId("input")
    if (!input) throw new Error("Missing input")
    root.renderer.nativeSimulateKeystrokes(input.id, "a")
    expect(changes).toBe(0)
    root.unmount()
  }
})

type EditorKind = "input" | "textarea"

interface FocusFormOptions {
  kind: EditorKind
  autoFocus?: boolean
  selectAllOnFocus?: boolean
  readOnly?: boolean
}

function createFocusForm({
  kind,
  autoFocus = false,
  selectAllOnFocus,
  readOnly = false,
}: FocusFormOptions) {
  const root = createTestRoot({ width: 400, height: 180 })
  const changes: string[] = []
  function Form({ readOnly }: { readOnly: boolean }) {
    const [value, setValue] = useState("alpha")
    const onValueChange = (next: string) => {
      changes.push(next)
      setValue(next)
    }
    const props = { testId: "editor", value, autoFocus, selectAllOnFocus, readOnly }
    return (
      <div style={{ display: "flex", flexDirection: "column", width: 240 }}>
        <div testId="before-editor" role="button" tabIndex={0} style={{ height: 24 }}>
          Before
        </div>
        {kind === "input" ? (
          <Input {...props} onValueChange={onValueChange} />
        ) : (
          <textarea
            {...props}
            style={{ width: 240, paddingLeft: 6, paddingRight: 6 }}
            onChange={event => {
              if (event.value !== undefined) onValueChange(event.value)
            }}
          />
        )}
        <div testId="after-editor" role="button" tabIndex={0} style={{ height: 24 }}>
          After
        </div>
      </div>
    )
  }
  const render = (readOnly: boolean) => {
    root.render(
      <ThemeProvider>
        <Form readOnly={readOnly} />
      </ThemeProvider>
    )
    root.renderer.flush()
  }
  render(readOnly)
  const editor = root.renderer.findByTestId("editor")
  const before = root.renderer.findByTestId("before-editor")
  const after = root.renderer.findByTestId("after-editor")
  if (!editor || !before || !after) throw new Error("Missing focus form controls")
  return { root, editor, before, after, changes, render }
}

for (const kind of ["input", "textarea"] satisfies EditorKind[]) {
  test(`${kind} autoFocus selects existing text before the first replacement`, () => {
    const { root, editor, changes } = createFocusForm({
      kind,
      autoFocus: true,
      selectAllOnFocus: true,
    })
    try {
      expect(root.renderer.getFocusedElementId()).toBe(editor.id)
      root.renderer.simulateKeystrokes("x")
      expect(changes).toEqual(["x"])
    } finally {
      root.unmount()
    }
  })

  test(`${kind} Tab focus selects text and refocus selects the replacement again`, () => {
    const { root, editor, before, after, changes } = createFocusForm({
      kind,
      selectAllOnFocus: true,
    })
    try {
      root.renderer.focusElement(before.id)
      root.renderer.simulateKeystrokes("tab")
      expect(root.renderer.getFocusedElementId()).toBe(editor.id)
      root.renderer.simulateKeystrokes("x")
      expect(changes).toEqual(["x"])
      root.renderer.simulateKeystrokes("tab")
      expect(root.renderer.getFocusedElementId()).toBe(after.id)
      root.renderer.simulateKeystrokes("shift-tab")
      expect(root.renderer.getFocusedElementId()).toBe(editor.id)
      root.renderer.simulateKeystrokes("y")
      expect(changes).toEqual(["x", "y"])
    } finally {
      root.unmount()
    }
  })

  test(`${kind} programmatic focus selects text on every focus entry`, () => {
    const { root, editor, after, changes } = createFocusForm({
      kind,
      selectAllOnFocus: true,
    })
    try {
      root.renderer.focusElement(editor.id)
      root.renderer.simulateKeystrokes("x")
      root.renderer.focusElement(after.id)
      root.renderer.focusElement(editor.id)
      root.renderer.simulateKeystrokes("y")
      expect(changes).toEqual(["x", "y"])
    } finally {
      root.unmount()
    }
  })

  for (const selectAllOnFocus of [undefined, false]) {
    test(`${kind} selectAllOnFocus=${String(selectAllOnFocus)} preserves the default end caret`, () => {
      const { root, changes } = createFocusForm({
        kind,
        autoFocus: true,
        selectAllOnFocus,
      })
      try {
        root.renderer.simulateKeystrokes("x")
        expect(changes).toEqual(["alphax"])
      } finally {
        root.unmount()
      }
    })
  }

  for (const placement of ["start", "end"]) {
    test(`${kind} mouse focus preserves the ${placement} caret after the deferred focus effect`, () => {
      const { root, editor, after, changes } = createFocusForm({
        kind,
        selectAllOnFocus: true,
      })
      try {
        root.renderer.focusElement(after.id)
        const bounds = root.renderer.getElementBounds(editor.id)
        if (!bounds) throw new Error("Unpainted editor")
        const x = placement === "start" ? bounds.x + 8 : bounds.x + bounds.width - 12
        root.renderer.nativeSimulateMouseDown(x, bounds.y + Math.min(8, bounds.height / 2))
        root.renderer.nativeSimulateMouseUp(x, bounds.y + Math.min(8, bounds.height / 2))
        root.renderer.flush()
        expect(root.renderer.getFocusedElementId()).toBe(editor.id)
        root.renderer.simulateKeystrokes("x")
        expect(changes).toEqual([placement === "start" ? "xalpha" : "alphax"])
        root.renderer.simulateKeystrokes("tab")
        expect(root.renderer.getFocusedElementId()).toBe(after.id)
        root.renderer.simulateKeystrokes("shift-tab")
        root.renderer.simulateKeystrokes("y")
        expect(changes.at(-1)).toBe("y")
      } finally {
        root.unmount()
      }
    })
  }

  test(`${kind} readOnly focus selects without editing and retains that selection when unlocked`, () => {
    const { root, editor, changes, render } = createFocusForm({
      kind,
      autoFocus: true,
      selectAllOnFocus: true,
      readOnly: true,
    })
    try {
      root.renderer.simulateKeystrokes("x backspace delete")
      expect(changes).toEqual([])
      render(false)
      expect(root.renderer.getFocusedElementId()).toBe(editor.id)
      root.renderer.simulateKeystrokes("y")
      expect(changes).toEqual(["y"])
    } finally {
      root.unmount()
    }
  })
}
