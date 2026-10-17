import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./index"

test.each([600, 601])(
  "empty state centers a bounded header in a %ipx viewport and exposes its heading",
  width => {
    const root = createTestRoot({ width, height: 300 })
    try {
      root.render(
        <ThemeProvider>
          <Empty testId="empty" style={{ width, height: 300 }}>
            <EmptyHeader testId="header">
              <EmptyTitle>No projects</EmptyTitle>
              <EmptyDescription>Create a project to begin</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </ThemeProvider>
      )
      root.renderer.flush()
      const empty = root.renderer.findByTestId("empty")
      const header = root.renderer.findByTestId("header")
      if (!empty || !header) throw new Error("Empty state missing")
      const bounds = root.renderer.getElementBounds(header.id)
      const emptyBounds = root.renderer.getElementBounds(empty.id)
      if (!bounds || !emptyBounds) throw new Error("Empty state not laid out")
      expect(bounds.width).toBeLessThan(emptyBounds.width)
      // An odd parent/header pixel difference rounds the origin and leaves a half-pixel center error.
      expect(
        Math.abs(bounds.x + bounds.width / 2 - emptyBounds.x - emptyBounds.width / 2)
      ).toBeLessThanOrEqual(0.5)
      expect(
        Object.values(root.renderer.getA11yTree().nodes ?? {}).some(
          node => node.aria?.role === "Heading"
        )
      ).toBe(true)
    } finally {
      root.unmount()
    }
  }
)
