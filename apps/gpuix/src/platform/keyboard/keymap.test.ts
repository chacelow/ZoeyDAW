import { expect, test } from "bun:test"
import { createKeymap, DEFAULT_KEYMAP } from "."
import type { KeyboardContext } from "."

const context: KeyboardContext = {
  focus: "timeline",
  computerKeyboard: false,
  browserSearch: false,
}
const event = (key: string, shift = false) => ({
  key,
  defaultPrevented: false,
  modifiers: { ctrl: true, cmd: false, alt: false, shift },
})

test("overlapping contexts and modifier aliases reject ambiguous bindings at registration", () => {
  expect(() =>
    createKeymap([
      {
        keys: "Shift?+Mod+S",
        command: "project.save",
        context: { focus: ["timeline", "clip-editor"] },
      },
      { keys: "Shift+Ctrl+S", command: "edit.undo", context: { focus: ["timeline"] } },
    ])
  ).toThrow(/Conflicting.*project.save.*edit.undo/)
  const disjoint = createKeymap([
    { keys: "Mod+S", command: "project.save", context: { focus: ["timeline"] } },
    { keys: "Ctrl+S", command: "edit.undo", context: { focus: ["text"] } },
  ])
  expect(disjoint.resolve(event("s"), context)).toBe("project.save")
  expect(disjoint.resolve(event("s"), { ...context, focus: "text" })).toBe("edit.undo")
})

test("one chord resolves by text menu clip-editor and timeline contexts rather than row order", () => {
  const bindings = [
    { keys: "Mod+Z", command: "edit.undo", context: { focus: ["timeline"] } },
    { keys: "Mod+Z", command: "edit.redo", context: { focus: ["clip-editor"] } },
  ] as const
  for (const map of [createKeymap(bindings), createKeymap([...bindings].reverse())]) {
    expect(map.resolve(event("z"), { ...context, focus: "timeline" })).toBe("edit.undo")
    expect(map.resolve(event("z"), { ...context, focus: "clip-editor" })).toBe("edit.redo")
    expect(map.resolve(event("z"), { ...context, focus: "text" })).toBeUndefined()
    expect(map.resolve(event("z"), { ...context, focus: "menu" })).toBeUndefined()
  }
  expect(DEFAULT_KEYMAP.resolve(event("s"), { ...context, focus: "clip-editor" })).toBe(
    "project.save"
  )
  expect(DEFAULT_KEYMAP.resolve(event("z"), { ...context, focus: "clip-editor" })).toBeUndefined()
  expect(DEFAULT_KEYMAP.resolve(event("s"), { ...context, focus: "menu" })).toBeUndefined()
  expect(DEFAULT_KEYMAP.resolve({ key: "a", defaultPrevented: false }, context)).toBe(
    "arrangement.toggleAutomation"
  )
  expect(
    DEFAULT_KEYMAP.resolve(
      { key: "a", defaultPrevented: false },
      { ...context, computerKeyboard: true }
    )
  ).toBe("computerKeyboard.note")
})
