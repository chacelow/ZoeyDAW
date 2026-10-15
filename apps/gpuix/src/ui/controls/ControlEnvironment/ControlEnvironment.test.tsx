import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { DragPadNumber } from "../DragPad"
import { ControlEnvironmentProvider } from "."
import type { ControlInfo } from "."

test("nearest environment receives only component kind, never a resource label or input value", () => {
  const app: Array<ControlInfo | null> = []
  const gallery: Array<ControlInfo | null> = []
  const root = createTestRoot({ width: 360, height: 160 })
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider
        value={{
          setInfo: info => {
            app.push(info)
          },
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <Button testId="app">Private resource name</Button>
          <ControlEnvironmentProvider
            value={{
              setInfo: info => {
                gallery.push(info)
              },
            }}
          >
            <Button testId="gallery">123.456</Button>
          </ControlEnvironmentProvider>
        </div>
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  const node = root.renderer.findByTestId("gallery")!
  root.renderer.focusElement(node.id)
  expect(gallery.at(-1)).toBe("button")
  expect(app.includes("button")).toBe(false)
  expect(gallery.every(info => info === null || info === "button")).toBe(true)
  root.unmount()
})

test("native focus and blur move control info between controls without a sampler", () => {
  const updates: Array<ControlInfo | null> = []
  const root = createTestRoot({ width: 360, height: 160 })
  root.render(
    <ThemeProvider>
      <ControlEnvironmentProvider
        value={{
          setInfo: info => {
            updates.push(info)
          },
        }}
      >
        <div>
          <Button testId="button">Private resource</Button>
          <DragPadNumber
            testId="number"
            label="Private numeric value"
            value={120}
            onChange={() => {}}
            min={20}
            max={300}
            step={1}
          />
          <input testId="outside" aria-label="Outside controls" />
        </div>
      </ControlEnvironmentProvider>
    </ThemeProvider>
  )
  root.renderer.focusElement(root.renderer.findByTestId("button")!.id)
  expect(updates.at(-1)).toBe("button")
  root.renderer.focusElement(root.renderer.findByTestId("number")!.id)
  expect(updates.at(-1)).toBe("number")
  root.renderer.focusElement(root.renderer.findByTestId("outside")!.id)
  expect(updates.at(-1)).toBeNull()
  root.unmount()
})
