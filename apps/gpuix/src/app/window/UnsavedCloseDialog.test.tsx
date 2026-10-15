import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { initAppI18n } from "../i18n"
import { AppInteractionProvider } from "../interaction"
import { UnsavedCloseDialog } from "./UnsavedCloseDialog"
import type { TestRoot } from "@gpuix/react/testing"

function shellBounds(root: TestRoot) {
  const popup = root.renderer.findByTestId("unsaved-close")
  const shell = popup?.children[0]
  const bounds = shell === undefined ? null : root.renderer.getElementBounds(shell)
  if (!bounds) throw new Error("Unsaved dialog shell was not painted")
  return bounds
}
function buttonBounds(root: TestRoot) {
  const button = root.renderer.findByTestId("unsaved-save")
  const bounds = button && root.renderer.getElementBounds(button.id)
  if (!bounds) throw new Error("Save action was not painted")
  return bounds
}

test("custom popover inset changes the real dialog shell without resizing its actions", () => {
  initAppI18n({ storage: { get: () => "en", set: () => {} } })
  const root = createTestRoot({ width: 800, height: 600 })
  const baseline = DEFAULT_DESIGN_TOKENS
  const custom = {
    ...baseline,
    popover: { ...baseline.popover, inset: baseline.popover.inset + 7 },
  }
  function draw(design: typeof baseline) {
    root.render(
      <ThemeProvider design={design}>
        <AppInteractionProvider>
          <UnsavedCloseDialog open onChoose={() => {}} />
        </AppInteractionProvider>
      </ThemeProvider>
    )
    root.renderer.flush()
    return { shell: shellBounds(root), button: buttonBounds(root) }
  }
  try {
    const before = draw(baseline)
    const after = draw(custom)
    const insetDelta = custom.popover.inset - baseline.popover.inset
    expect(after.shell.height - before.shell.height).toBe(insetDelta * 2)
    expect(after.shell.width).toBe(before.shell.width)
    expect(after.button.width).toBe(before.button.width)
    expect(after.button.height).toBe(before.button.height)
    const beforeInset = before.shell.x + before.shell.width - before.button.x - before.button.width
    const afterInset = after.shell.x + after.shell.width - after.button.x - after.button.width
    expect(afterInset - beforeInset).toBe(insetDelta)
  } finally {
    root.unmount()
  }
})
