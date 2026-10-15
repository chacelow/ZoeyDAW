import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { LoadErrorScreen } from "./index"

test("load errors expose the original failure and execute retry via native input", () => {
  let retries = 0
  const root = createTestRoot({ width: 500, height: 400 })
  root.render(
    <ThemeProvider>
      <LoadErrorScreen
        testId="error"
        title="Project unavailable"
        error={new Error("File is missing")}
        onRetry={() => {
          retries += 1
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  expect(root.renderer.findByText("File is missing")).toBeDefined()
  const retry = root.renderer.findByTestId("error-retry")
  if (!retry) throw new Error("Retry button missing")
  const bounds = root.renderer.getElementBounds(retry.id)
  if (!bounds) throw new Error("Retry button not laid out")
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  root.renderer.nativeSimulateKeystrokes(retry.id, "enter")
  expect(retries).toBe(2)
  root.unmount()
})

test("original primary and secondary actions retain their labels and handlers", () => {
  const actions: string[] = []
  const root = createTestRoot({ width: 500, height: 400 })
  root.render(
    <ThemeProvider>
      <LoadErrorScreen
        testId="error"
        title="Failed"
        description="Try a snapshot"
        primaryLabel="Reload"
        onPrimary={() => {
          actions.push("primary")
        }}
        secondaryLabel="Back"
        onSecondary={() => {
          actions.push("secondary")
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  for (const name of ["secondary", "retry"]) {
    const button = root.renderer.findByTestId(`error-${name}`)
    if (!button) throw new Error("Error action missing")
    root.renderer.nativeSimulateKeystrokes(button.id, "enter")
  }
  expect(actions).toEqual(["secondary", "primary"])
  root.unmount()
})
