import { expect, test } from "bun:test"
import { createAppInteraction } from "./interaction"

test("overlapping text/modal leases survive stale duplicate releases and clear on the last release", () => {
  const owner = createAppInteraction()
  const first = owner.textFocus.enter()
  const second = owner.textFocus.enter()
  first()
  first()
  expect(owner.isTextFocused()).toBe(true)
  const third = owner.textFocus.enter()
  second()
  expect(owner.isTextFocused()).toBe(true)
  third()
  expect(owner.isTextFocused()).toBe(false)
  const settings = owner.enterModal()
  const closeConfirmation = owner.enterModal()
  settings()
  settings()
  expect(owner.isModalOpen()).toBe(true)
  expect(owner.isTextFocused()).toBe(false)
  closeConfirmation()
  expect(owner.isModalOpen()).toBe(false)
})
