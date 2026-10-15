import { describe, expect, test } from "bun:test"
import { chooseClose, IDLE_CLOSE, requestClose } from "./unsaved-close"
import type { UnsavedCloseChoice, UnsavedCloseState } from "./unsaved-close"

describe("unsaved close policy", () => {
  test("clean windows close; dirty windows are vetoed and ask", () => {
    expect(requestClose(IDLE_CLOSE, false)).toEqual({ allow: true, next: IDLE_CLOSE })
    expect(requestClose(IDLE_CLOSE, true)).toEqual({ allow: false, next: { phase: "asking" } })
  })

  test("save success or discard arms exactly one following close", () => {
    for (const [choice, saved] of [
      ["save", true],
      ["discard", false],
    ] as const) {
      const armed = chooseClose({ phase: "asking" }, choice, saved)
      expect(armed).toEqual({ phase: "armed" })
      const first = requestClose(armed, true)
      expect(first.allow).toBe(true)
      expect(requestClose(first.next, true).allow).toBe(false)
    }
  })

  test("cancel and a failed save keep the window open", () => {
    expect(chooseClose({ phase: "asking" }, "cancel", false)).toEqual(IDLE_CLOSE)
    expect(chooseClose({ phase: "asking" }, "save", false)).toEqual(IDLE_CLOSE)
  })

  test("random request/choice sequences never allow a dirty close without a decision", () => {
    let seed = 11
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31
    const choices: UnsavedCloseChoice[] = ["save", "discard", "cancel"]
    for (let run = 0; run < 2000; run++) {
      let state: UnsavedCloseState = IDLE_CLOSE
      let decided = false
      for (let step = 0; step < 8; step++) {
        if (next() < 0.5) {
          const dirty = next() < 0.8
          const result = requestClose(state, dirty)
          if (dirty && result.allow) expect(decided).toBe(true)
          if (result.allow) decided = false
          state = result.next
        } else {
          const choice = choices[Math.floor(next() * choices.length)] ?? "cancel"
          const saved = next() < 0.5
          const asking = state.phase === "asking"
          state = chooseClose(state, choice, saved)
          if (asking && state.phase === "armed") decided = true
        }
      }
    }
  })
})
