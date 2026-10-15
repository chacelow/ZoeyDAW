import { afterEach, expect, jest, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { dismissToast, toast, Toaster, toastLoading } from "./index"

afterEach(() => {
  flushSync(() => dismissToast())
  jest.useRealTimers()
})

test("toast actions and dismiss buttons perform native interactions", () => {
  let calls = 0
  const root = createTestRoot({ width: 600, height: 400 })
  root.render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  )
  const id = flushSync(() =>
    toast({
      title: "Saved",
      message: "Project saved",
      duration: 0,
      action: {
        label: "Undo",
        onClick: () => {
          calls += 1
        },
      },
    })
  )
  root.renderer.flush()
  expect(root.renderer.findByText("Saved")).toBeDefined()
  expect(root.renderer.findByText("Project saved")).toBeDefined()
  expect(root.renderer.findByText("Undo")).toBeDefined()
  const action = root.renderer.findByTestId(`toaster-${id}-action`)
  if (!action) throw new Error("Toast action missing")
  root.renderer.nativeSimulateKeystrokes(action.id, "enter")
  expect(calls).toBe(1)
  expect(root.renderer.findByTestId(`toaster-${id}`)).toBeUndefined()
  const nextId = flushSync(() => toast.error("Cannot save", { duration: 0 }))
  root.renderer.flush()
  const dismiss = root.renderer.findByTestId(`toaster-${nextId}-dismiss`)
  if (!dismiss) throw new Error("Toast dismiss button missing")
  const bounds = root.renderer.getElementBounds(dismiss.id)
  if (!bounds) throw new Error("Toast dismiss button not laid out")
  root.renderer.nativeSimulateClick(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  expect(root.renderer.findByTestId(`toaster-${nextId}`)).toBeUndefined()
  root.unmount()
})

test("original loading API updates a stable id and resets its dismissal timer", () => {
  jest.useFakeTimers()
  const root = createTestRoot({ width: 600, height: 400 })
  root.render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  )
  expect(flushSync(() => toastLoading("Opening", "project-load"))).toBe("project-load")
  flushSync(() => jest.advanceTimersByTime(10_000))
  root.renderer.flush()
  expect(root.renderer.findByText("Opening")).toBeDefined()
  flushSync(() => toast.success("Opened", { id: "project-load", duration: 100 }))
  root.renderer.flush()
  expect(root.renderer.findByText("Opening")).toBeUndefined()
  expect(root.renderer.findByText("Opened")).toBeDefined()
  flushSync(() => jest.advanceTimersByTime(99))
  root.renderer.flush()
  expect(root.renderer.findByText("Opened")).toBeDefined()
  flushSync(() => jest.advanceTimersByTime(1))
  root.renderer.flush()
  expect(root.renderer.findByText("Opened")).toBeUndefined()
  root.unmount()
})

test("toast timers are disposed when replaced, evicted, or explicitly cleared", () => {
  jest.useFakeTimers()
  const root = createTestRoot({ width: 600, height: 400 })
  root.render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  )
  flushSync(() => {
    for (let index = 0; index < 9; index += 1) toast(String(index), { duration: 100 })
  })
  expect(jest.getTimerCount()).toBe(8)
  flushSync(() => toast("Updated", { id: "stable", duration: 100 }))
  expect(jest.getTimerCount()).toBe(8)
  flushSync(() => toastLoading("Persistent", "stable"))
  expect(jest.getTimerCount()).toBe(7)
  flushSync(() => toast.dismiss())
  root.renderer.flush()
  expect(jest.getTimerCount()).toBe(0)
  expect(root.renderer.findByText("Persistent")).toBeUndefined()
  root.unmount()
})

test("a loading notice replaced without a duration resumes normal auto-dismiss across subscribers", () => {
  jest.useFakeTimers()
  const first = createTestRoot({ width: 600, height: 400 })
  const second = createTestRoot({ width: 600, height: 400 })
  first.render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  )
  second.render(
    <ThemeProvider>
      <Toaster />
    </ThemeProvider>
  )
  flushSync(() => toastLoading("Reading", "shared"))
  first.renderer.flush()
  second.renderer.flush()
  expect(first.renderer.findByText("Reading")).toBeDefined()
  expect(second.renderer.findByText("Reading")).toBeDefined()
  flushSync(() => toast.error("Read failed", { id: "shared" }))
  first.renderer.flush()
  second.renderer.flush()
  expect(first.renderer.findByText("Reading")).toBeUndefined()
  expect(second.renderer.findByText("Read failed")).toBeDefined()
  flushSync(() => jest.advanceTimersByTime(4200))
  first.renderer.flush()
  second.renderer.flush()
  expect(first.renderer.findByText("Read failed")).toBeUndefined()
  expect(second.renderer.findByText("Read failed")).toBeUndefined()
  first.unmount()
  second.unmount()
})
