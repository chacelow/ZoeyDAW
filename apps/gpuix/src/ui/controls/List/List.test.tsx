import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { DEFAULT_DESIGN_TOKENS, createDesignTokens } from "@/shared/theme/design-tokens"
import { CONTROL_METRICS } from "@/shared/theme/metrics/config"
import { List } from "."
import { ListRow } from "../ListRow"
import type { DesignTokens } from "@/shared/theme/design-tokens"

test("adjacent native rows follow the list gap when the theme changes", () => {
  const root = createTestRoot({ width: 320, height: 180 })
  const render = (design: DesignTokens) => {
    root.render(
      <ThemeProvider design={design}>
        <List aria-label="Library">
          <ListRow testId="first" label="First" />
          <ListRow testId="second" label="Second" />
        </List>
      </ThemeProvider>
    )
    root.renderer.flush()
    const first = root.renderer.findByTestId("first")
    const second = root.renderer.findByTestId("second")
    const firstBounds = first && root.renderer.getElementBounds(first.id)
    const secondBounds = second && root.renderer.getElementBounds(second.id)
    if (!firstBounds || !secondBounds) throw new Error("Missing native row bounds")
    return secondBounds.y - firstBounds.y - firstBounds.height
  }
  try {
    const initialGap = DEFAULT_DESIGN_TOKENS.list.rowGap
    expect(render(DEFAULT_DESIGN_TOKENS)).toBe(initialGap)
    const control = {
      ...CONTROL_METRICS.default,
      "--spacing-control-track-gap": initialGap * 2,
    }
    expect(render(createDesignTokens(control))).toBe(initialGap * 2)
    const changed = {
      ...DEFAULT_DESIGN_TOKENS,
      list: { rowGap: initialGap * 3 },
    }
    expect(render(changed)).toBe(changed.list.rowGap)
  } finally {
    root.unmount()
  }
})
