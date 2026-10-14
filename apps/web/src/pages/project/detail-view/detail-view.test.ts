import { expect, it } from "vitest"
import { collapseDetailViews, isDetailVisible, setDetailVisible } from "."
import type { DetailViewState } from "."

it("toggles Clip and Device independently, including both and neither", () => {
  let state: DetailViewState = { visible: "devices", restore: "devices" }
  state = setDetailVisible(state, "clip", true)
  expect(state.visible).toBe("both")
  state = setDetailVisible(state, "devices", false)
  expect(isDetailVisible(state.visible, "clip")).toBe(true)
  expect(isDetailVisible(state.visible, "devices")).toBe(false)
  state = setDetailVisible(state, "clip", false)
  expect(state).toEqual({ visible: "none", restore: "clip" })
})

it("preserves both views through sequential collapse resize callbacks", () => {
  let state: DetailViewState = { visible: "both", restore: "both" }
  state = collapseDetailViews(state)
  state = setDetailVisible(state, "clip", false)
  state = setDetailVisible(state, "devices", false)
  expect(state).toEqual({ visible: "none", restore: "both" })
  state = setDetailVisible(state, "clip", true)
  state = setDetailVisible(state, "devices", true)
  expect(state.visible).toBe("both")
})
