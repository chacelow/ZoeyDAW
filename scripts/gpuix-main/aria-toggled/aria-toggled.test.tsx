import { afterEach, expect, test } from "bun:test"
import type { Props } from "@gpuix/react"
import { createTestRoot, type TestRoot } from "@gpuix/react/testing"

let root: TestRoot | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
})

test("native toggle semantics survive updates, precedence and prop removal", () => {
  root = createTestRoot({ width: 320, height: 160 })
  const mounted = root
  function render(props: Pick<Props, "aria-pressed" | "aria-checked">) {
    mounted.render(
      <div role="button" aria-label="Toggle probe" {...props} style={{ width: 120, height: 32 }} />
    )
    const node = Object.values(mounted.renderer.getA11yTree().nodes ?? {}).find(
      candidate => candidate.aria?.label === "Toggle probe"
    )
    if (!node?.aria) throw new Error("Missing native toggle node")
    return "toggled" in node.aria ? node.aria.toggled : undefined
  }

  expect(render({})).toBeUndefined()
  for (const key of ["aria-pressed", "aria-checked"] as const) {
    expect(render({ [key]: true })).toBe("True")
    expect(render({ [key]: false })).toBe("False")
    expect(render({ [key]: "mixed" })).toBe("Mixed")
    expect(render({})).toBeUndefined()
  }
  expect(render({ "aria-pressed": true, "aria-checked": false })).toBe("False")
  expect(render({ "aria-pressed": false, "aria-checked": "mixed" })).toBe("Mixed")
  expect(render({ "aria-pressed": false })).toBe("False")
  expect(render({})).toBeUndefined()
})
