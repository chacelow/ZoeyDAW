import { expect, spyOn, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Button } from "../Button"
import { ControlEnvironmentProvider } from "."
import type { ControlInfo } from "."

test("nearest environment receives only component kind, never a resource label or input value", async () => {
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
  await Bun.sleep(45)
  expect(gallery.at(-1)).toBe("button")
  expect(app.includes("button")).toBe(false)
  expect(gallery.every(info => info === null || info === "button")).toBe(true)
  root.unmount()
})

test("multiple controls share one lazy sampler and last unsubscribe stops it", () => {
  const root = createTestRoot({ width: 360, height: 160 })
  const starts = spyOn(globalThis, "setInterval")
  const stops = spyOn(globalThis, "clearInterval")
  const updates: Array<ControlInfo | null> = []
  const setInfo = (info: ControlInfo | null) => {
    updates.push(info)
  }
  function Harness({ count }: { readonly count: number }) {
    return (
      <ThemeProvider>
        <ControlEnvironmentProvider value={{ setInfo }}>
          <div>
            {Array.from({ length: count }, (_, index) => (
              <Button key={index}>Control {index}</Button>
            ))}
          </div>
        </ControlEnvironmentProvider>
      </ThemeProvider>
    )
  }
  try {
    root.render(<Harness count={0} />)
    expect(starts).toHaveBeenCalledTimes(0)
    root.render(<Harness count={2} />)
    expect(starts).toHaveBeenCalledTimes(1)
    root.render(<Harness count={1} />)
    expect(starts).toHaveBeenCalledTimes(1)
    expect(stops).toHaveBeenCalledTimes(0)
    root.render(<Harness count={0} />)
    expect(stops).toHaveBeenCalledTimes(1)
  } finally {
    root.unmount()
    starts.mockRestore()
    stops.mockRestore()
  }
})
