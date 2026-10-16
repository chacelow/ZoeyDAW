import { afterEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { PanelEnvironmentProvider } from "@/ui/panels"
import { FooterPanel } from "@/project/sections/footer"
import { StatusStrip } from "@/project/sections/status"
import { englishFooterLabels } from "@/project/sections/footer/demo-labels"
import { englishStatusLabels } from "@/project/sections/status/demo-labels"
import { ProjectLayout } from "./ProjectLayout"
import { useProjectShell } from "./useProjectShell"

const root = createTestRoot({ width: 1280, height: 800 })
afterEach(() => root.unmount())
function Shell() {
  const shell = useProjectShell()
  return (
    <ProjectLayout
      projectId="shell-regression"
      shell={shell}
      focusRef={() => {}}
      labels={{
        resizeClipEdit: "Resize Clip",
        resizeBrowser: "Resize Browser",
        browserPanel: "Browser",
        arrangementPanel: "Arrangement",
        footerPanel: "Footer",
        activeDescription: "Active",
      }}
      transport={null}
      browser={<div />}
      arrangement={<div />}
      footer={
        <FooterPanel
          labels={englishFooterLabels}
          view={shell.footerView}
          collapsed={shell.footerCollapsed}
          onCollapsedChange={shell.setFooterCollapsed}
          renderClipEditor={() => null}
          subscribeWindowActive={() => () => {}}
        />
      }
      status={
        <StatusStrip
          labels={englishStatusLabels}
          view={shell.footerView}
          footerCollapsed={shell.footerCollapsed}
          onToggleFooter={shell.toggleFooter}
          onViewChange={shell.selectFooterView}
          info={null}
          warnings={[]}
        />
      }
    />
  )
}
function settle() {
  for (let round = 0; round < 8; round++) {
    root.renderer.flush()
    root.renderer.dispatchNativeEvents()
  }
}
function enter(testId: string) {
  const element = root.renderer.findByTestId(testId)
  if (!element) throw new Error(`Missing ${testId}`)
  root.renderer.nativeSimulateKeystrokes(element.id, "enter")
  settle()
}
test("real Clip panel collapses without resize feedback reopening its content", () => {
  root.render(
    <ThemeProvider>
      <PanelEnvironmentProvider environment={{ subscribeWindowActive: () => () => {} }}>
        <Shell />
      </PanelEnvironmentProvider>
    </ThemeProvider>
  )
  settle()
  enter("status-clip")
  expect(root.renderer.findByTestId("footer-content")).toBeDefined()
  enter("status-clip")
  expect(root.renderer.findByTestId("footer-content")).toBeUndefined()
  const panel = root.renderer.findByTestId("clip-panel")
  if (!panel) throw new Error("Missing Clip panel")
  expect(root.renderer.getElementBounds(panel.id)?.height).toBe(0)
})
