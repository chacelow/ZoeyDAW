import { afterEach, beforeEach, expect, jest, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"

import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { configureToastPolicy, dismissToast, toast, Toaster, toastLoading } from "./index"
import type { ToastPolicy } from "./index"
import { DEFAULT_DESIGN_TOKENS } from "@/shared/theme/design-tokens"
import { getThemePreset } from "@/shared/theme/presets"

const TEST_POLICY: ToastPolicy = { defaultDuration: 4200, queueLimit: 8, visibleLimit: 4 }
const labels = { "aria-label": "Notifications", dismissLabel: "Dismiss", loadingLabel: "Loading" }

function bounds(root: TestRoot, testId: string) {
  const element = root.renderer.findByTestId(testId)
  const box = element && root.renderer.getElementBounds(element.id)
  if (!box) throw new Error(`Missing notification bounds: ${testId}`)
  return box
}

beforeEach(() => configureToastPolicy(TEST_POLICY))

afterEach(() => {
  flushSync(() => dismissToast())
  jest.useRealTimers()
})

test("toast actions and dismiss buttons perform native interactions", () => {
  let calls = 0
  const root = createTestRoot({ width: 600, height: 400 })
  root.render(
    <ThemeProvider>
      <Toaster {...labels} policy={TEST_POLICY} />
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
      <Toaster {...labels} policy={TEST_POLICY} />
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
      <Toaster {...labels} policy={TEST_POLICY} />
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
      <Toaster {...labels} policy={TEST_POLICY} />
    </ThemeProvider>
  )
  second.render(
    <ThemeProvider>
      <Toaster {...labels} policy={TEST_POLICY} />
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

test("notification policy controls expiry, queue eviction and visible notices", () => {
  jest.useFakeTimers()
  const policy: ToastPolicy = { defaultDuration: 250, queueLimit: 3, visibleLimit: 2 }
  configureToastPolicy(policy)
  const root = createTestRoot({ width: 600, height: 400 })
  try {
    root.render(
      <ThemeProvider>
        <Toaster {...labels} policy={policy} />
      </ThemeProvider>
    )
    flushSync(() => {
      toast("First", { id: "first" })
      toast("Second", { id: "second" })
      toast("Third", { id: "third" })
      toast("Fourth", { id: "fourth" })
    })
    root.renderer.flush()
    expect(root.renderer.findByText("First")).toBeUndefined()
    expect(root.renderer.findByText("Second")).toBeUndefined()
    expect(root.renderer.findByText("Third")).toBeDefined()
    expect(root.renderer.findByText("Fourth")).toBeDefined()
    expect(jest.getTimerCount()).toBe(3)
    flushSync(() => toast.dismiss("fourth"))
    root.renderer.flush()
    expect(root.renderer.findByText("Second")).toBeDefined()
    expect(root.renderer.findByText("Third")).toBeDefined()
    flushSync(() => toast.dismiss("third"))
    root.renderer.flush()
    expect(root.renderer.findByText("First")).toBeUndefined()
    expect(root.renderer.findByText("Second")).toBeDefined()
    flushSync(() => jest.advanceTimersByTime(249))
    root.renderer.flush()
    expect(root.renderer.findByText("Second")).toBeDefined()
    flushSync(() => jest.advanceTimersByTime(1))
    root.renderer.flush()
    expect(root.renderer.findByText("Second")).toBeUndefined()
  } finally {
    root.unmount()
  }
})

test("changing queue policy evicts oldest notices without restarting pending expiry", () => {
  jest.useFakeTimers()
  const root = createTestRoot({ width: 600, height: 400 })
  try {
    root.render(
      <ThemeProvider>
        <Toaster {...labels} policy={TEST_POLICY} />
      </ThemeProvider>
    )
    flushSync(() => {
      toast("Oldest", { id: "oldest", duration: 100 })
      toast("Retained", { id: "retained", duration: 150 })
    })
    flushSync(() => jest.advanceTimersByTime(50))
    const policy: ToastPolicy = { defaultDuration: 900, queueLimit: 1, visibleLimit: 1 }
    flushSync(() => configureToastPolicy(policy))
    root.render(
      <ThemeProvider>
        <Toaster {...labels} policy={policy} />
      </ThemeProvider>
    )
    root.renderer.flush()
    expect(root.renderer.findByText("Oldest")).toBeUndefined()
    expect(root.renderer.findByText("Retained")).toBeDefined()
    expect(jest.getTimerCount()).toBe(1)
    flushSync(() => jest.advanceTimersByTime(99))
    root.renderer.flush()
    expect(root.renderer.findByText("Retained")).toBeDefined()
    flushSync(() => jest.advanceTimersByTime(1))
    root.renderer.flush()
    expect(root.renderer.findByText("Retained")).toBeUndefined()
  } finally {
    root.unmount()
  }
})

test("toast card border token changes native content inset without moving the surface", () => {
  const root = createTestRoot({ width: 600, height: 400 })
  const render = (cardBorderWidth: number) => {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          shape: { ...DEFAULT_DESIGN_TOKENS.shape, cardBorderWidth },
        }}
      >
        <Toaster {...labels} position="top-left" policy={TEST_POLICY} />
      </ThemeProvider>
    )
    root.renderer.flush()
  }
  try {
    render(1)
    flushSync(() => toast({ id: "card", title: "Border response", duration: 0 }))
    root.renderer.flush()
    const original = bounds(root, "toaster-card")
    const title = root.renderer.findByText("Border response")
    if (!title) throw new Error("Missing notification title")
    const originalText = root.renderer.getElementBounds(title.id)
    if (!originalText) throw new Error("Missing notification title bounds")
    render(4)
    const changed = bounds(root, "toaster-card")
    const changedText = root.renderer.getElementBounds(title.id)
    if (!changedText) throw new Error("Missing updated notification title bounds")
    expect(changed.x).toBe(original.x)
    expect(changed.y).toBe(original.y)
    expect(changed.width).toBe(original.width)
    expect(changedText.x - originalText.x).toBe(3)
    expect(changedText.y - originalText.y).toBe(3)
  } finally {
    root.unmount()
  }
})

test("toast geometry sources control native placement, padding, stacking and corner paint", () => {
  const output = mkdtempSync(path.join(tmpdir(), "configuration-toast-"))
  const image = path.join(output, "frame.png")
  const root = createTestRoot({ width: 600, height: 400 })
  const render = (radius: number) => {
    root.render(
      <ThemeProvider
        design={{
          ...DEFAULT_DESIGN_TOKENS,
          toast: { edgeInset: 21, stackGap: 13, inset: 17, width: 220, radius },
        }}
      >
        <Toaster {...labels} position="top-left" policy={TEST_POLICY} />
      </ThemeProvider>
    )
    root.renderer.flush()
  }
  try {
    root.renderer.clockPause()
    render(0)
    flushSync(() => {
      toast({ id: "first", title: "First geometry", duration: 0 })
      toast({ id: "second", title: "Second geometry", duration: 0 })
    })
    root.renderer.flush()
    const first = bounds(root, "toaster-first")
    const second = bounds(root, "toaster-second")
    expect(first.x).toBe(21)
    expect(first.y).toBe(21)
    expect(first.width).toBe(220)
    expect(second.width).toBe(220)
    expect(second.y - first.y - first.height).toBe(13)
    const title = root.renderer.findByText("First geometry")
    const titleBounds = title && root.renderer.getElementBounds(title.id)
    if (!titleBounds) throw new Error("Missing toast content bounds")
    expect(titleBounds.x - first.x).toBe(17 + DEFAULT_DESIGN_TOKENS.shape.cardBorderWidth)
    expect(titleBounds.y - first.y).toBe(17 + DEFAULT_DESIGN_TOKENS.shape.cardBorderWidth)
    root.renderer.captureScreenshot(image)
    const square = readFileSync(image)
    render(14)
    root.renderer.captureScreenshot(image)
    expect(readFileSync(image).equals(square)).toBe(false)
    expect(bounds(root, "toaster-first")).toEqual(first)
  } finally {
    root.unmount()
    rmSync(output, { recursive: true, force: true })
  }
})

test("success notice paint follows controlled success independently of chart2", () => {
  const output = mkdtempSync(path.join(tmpdir(), "configuration-toast-success-"))
  const image = path.join(output, "frame.png")
  const root = createTestRoot({ width: 600, height: 400 })
  const base = getThemePreset("default").colors.dark
  const render = (success: string) => {
    root.render(
      <ThemeProvider appearance="dark" colors={{ ...base, success, chart2: "#0000ff" }}>
        <Toaster {...labels} position="top-left" policy={TEST_POLICY} />
      </ThemeProvider>
    )
    root.renderer.flush()
  }
  const notice = () => {
    const element = root.renderer.findByTestId("toaster-semantic")
    if (!element) throw new Error("Missing success notice")
    return element
  }
  try {
    root.renderer.clockPause()
    render("#ff0000")
    flushSync(() => toast.success("Semantic success", { id: "semantic", duration: 0 }))
    root.renderer.flush()
    expect(notice().style.borderColor).toBe("#ff0000")
    const original = bounds(root, "toaster-semantic")
    root.renderer.captureScreenshot(image)
    const red = readFileSync(image)
    render("#00ff00")
    expect(notice().style.borderColor).toBe("#00ff00")
    root.renderer.captureScreenshot(image)
    expect(readFileSync(image).equals(red)).toBe(false)
    expect(bounds(root, "toaster-semantic")).toEqual(original)
    render("#ff0000")
    root.renderer.captureScreenshot(image)
    expect(readFileSync(image).equals(red)).toBe(true)
  } finally {
    root.unmount()
    rmSync(output, { recursive: true, force: true })
  }
})
