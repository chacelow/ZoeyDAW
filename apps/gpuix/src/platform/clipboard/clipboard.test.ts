import { describe, expect, test } from "bun:test"
import { clipboardReadText, clipboardWriteText } from "@zoeydaw/native"
import { createNativeClipboard } from "."
import type { NativeClipboard } from "."

describe("native clipboard port", () => {
  test("defaults delegate directly to the synchronous native exports without touching the clipboard", () => {
    const clipboard = createNativeClipboard()
    expect(clipboard.readText).toBe(clipboardReadText)
    expect(clipboard.writeText).toBe(clipboardWriteText)
  })

  test("injected clipboard keeps empty text distinct from missing text and isolates instances", () => {
    let text: string | null = null
    const memory: NativeClipboard = {
      readText: () => text,
      writeText(value) {
        text = value
      },
    }
    const clipboard = createNativeClipboard(memory)
    let otherText: string | null = null
    const other = createNativeClipboard({
      readText: () => otherText,
      writeText(value) {
        otherText = value
      },
    })
    expect(clipboard.readText()).toBeNull()
    clipboard.writeText("")
    expect(clipboard.readText()).toBe("")
    clipboard.writeText("中文\n🎹 e\u0301\u0000尾")
    expect(clipboard.readText()).toBe("中文\n🎹 e\u0301\u0000尾")
    expect(other.readText()).toBeNull()
  })

  test("injected failures are not swallowed or replaced by a fallback", () => {
    const error = new Error("clipboard unavailable")
    const clipboard = createNativeClipboard({
      readText() {
        throw error
      },
      writeText() {
        throw error
      },
    })
    expect(() => clipboard.readText()).toThrow(error)
    expect(() => clipboard.writeText("text")).toThrow(error)
  })
})
