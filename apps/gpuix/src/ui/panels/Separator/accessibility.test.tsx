import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { Group } from "../Group"
import { Panel } from "../Panel"
import { Separator } from "."

test("splitter keeps injected name and exposes a language-neutral numeric value", () => {
  const root = createTestRoot({ width: 800, height: 200 })
  try {
    root.render(
      <ThemeProvider>
        <Group orientation="horizontal" style={{ width: 800, height: 200 }}>
          <Panel defaultSize="50">
            <text>左</text>
          </Panel>
          <Separator aria-label="调整浏览器宽度" />
          <Panel>
            <text>右</text>
          </Panel>
        </Group>
      </ThemeProvider>
    )
    root.renderer.flush()
    const separator = Object.values(root.renderer.getA11yTree().nodes ?? {}).find(
      node => node.aria?.role === "Splitter"
    )
    expect(separator?.aria?.label).toBe("调整浏览器宽度")
    expect(separator?.aria?.value).toMatch(/^\d+$/)
  } finally {
    root.unmount()
  }
})
