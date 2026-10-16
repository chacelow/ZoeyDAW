import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Loading } from "./index"

test("loading visibility, accessible status, and optional progress transition together", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <Loading show={false} label="Loading project" />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(root.renderer.findByText("Loading project")).toBeUndefined()
  root.render(
    <ThemeProvider>
      <Loading show label="Loading project" progress={50} progressValueText="一半已完成" />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(root.renderer.findByText("Loading project")).toBeDefined()
  const nodes = Object.values(root.renderer.getA11yTree().nodes ?? {})
  expect(
    nodes.some(node => node.aria?.role === "Status" && node.aria.label === "Loading project")
  ).toBe(true)
  expect(
    nodes.some(node => node.aria?.role === "ProgressIndicator" && node.aria.value === "一半已完成")
  ).toBe(true)
  root.render(
    <ThemeProvider>
      <Loading label="Preparing audio" />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(root.renderer.findByText("Preparing audio")).toBeDefined()
  expect(
    Object.values(root.renderer.getA11yTree().nodes ?? {}).some(
      node => node.aria?.role === "ProgressIndicator"
    )
  ).toBe(false)
  root.unmount()
})
