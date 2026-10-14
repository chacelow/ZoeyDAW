import { readOuterBounds } from "../useMeasuredTextWidth"
import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { DragPreviewArea } from "."

function mount(disabled = false) {
  const root = createTestRoot({ width: 640, height: 360 })
  const starts: string[] = []
  const ends: { data: string; cancelled: boolean }[] = []
  let clicks = 0
  root.render(
    <ThemeProvider>
      <DragPreviewArea
        data="kick.wav"
        disabled={disabled}
        disabledDropLabel="Drop unavailable"
        threshold={8}
        style={{ width: 300, marginTop: 24, marginLeft: 24 }}
        renderPreview={data => <div>{data}</div>}
        onClick={() => {
          clicks += 1
        }}
        onDragStart={data => {
          starts.push(data)
        }}
        onDragEnd={(data, result) => {
          ends.push({ data, ...result })
        }}
      >
        <div style={{ height: 40 }}>Kick sample</div>
      </DragPreviewArea>
    </ThemeProvider>
  )
  root.renderer.flush()
  const source = root.renderer.findByTestId("drag-source-source")
  if (!source) throw new Error("Missing drag source")
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(source.id))
  if (!bounds) throw new Error("Unpainted drag source")
  return { ...root, source, x: bounds.x + 10, y: bounds.y + 10, starts, ends, clicks: () => clicks }
}

test("pressed source crosses threshold, tracks native anchored preview, and releases outside", () => {
  const root = mount()
  root.renderer.nativeSimulateMouseDown(root.x, root.y)
  root.renderer.nativeSimulateMouseMove(root.x + 3, root.y + 2, 0)
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  expect(root.starts).toEqual([])
  root.renderer.nativeSimulateMouseMove(root.x + 50, root.y + 30, 0)
  expect(root.starts).toEqual(["kick.wav"])
  const preview = root.renderer.findByTestId("drag-preview")
  if (!preview) throw new Error("Missing active preview")
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(preview.id))
  expect(bounds?.x).toBeGreaterThan(root.x + 50)
  expect(bounds?.y).toBeGreaterThan(root.y + 30)
  root.renderer.nativeSimulateMouseMove(root.x + 360, root.y + 150, 0)
  root.renderer.nativeSimulateMouseUp(root.x + 360, root.y + 150)
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  expect(root.ends).toEqual([{ data: "kick.wav", cancelled: false }])
  root.unmount()
})

test("Escape cancels a drag and suppresses its synthesized click; ordinary clicks still work", () => {
  const root = mount()
  root.renderer.nativeSimulateClick(root.x, root.y)
  expect(root.clicks()).toBe(1)
  root.renderer.nativeSimulateMouseDown(root.x, root.y)
  root.renderer.nativeSimulateMouseMove(root.x + 30, root.y + 10, 0)
  root.renderer.simulateKeystrokes("escape")
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  expect(root.ends).toEqual([{ data: "kick.wav", cancelled: true }])
  root.renderer.nativeSimulateMouseUp(root.x + 30, root.y + 10)
  expect(root.clicks()).toBe(1)
  root.renderer.nativeSimulateClick(root.x, root.y)
  expect(root.clicks()).toBe(2)
  root.unmount()
})

test("disabled source never starts a drag", () => {
  const root = mount(true)
  root.renderer.nativeSimulateMouseDown(root.x, root.y)
  root.renderer.nativeSimulateMouseMove(root.x + 40, root.y + 20, 0)
  root.renderer.nativeSimulateMouseUp(root.x + 40, root.y + 20)
  expect(root.starts).toEqual([])
  expect(root.ends).toEqual([])
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  root.unmount()
})

test("explicit items preview their own native data instead of querying descendants", () => {
  const root = createTestRoot({ width: 640, height: 360 })
  let started = ""
  root.render(
    <ThemeProvider>
      <DragPreviewArea
        items={[
          { key: "a", data: "first", children: <div style={{ height: 32 }}>First source</div> },
          { key: "b", data: "second", children: <div style={{ height: 32 }}>Second source</div> },
        ]}
        disabledDropLabel="Unavailable"
        renderPreview={data => data}
        onDragStart={data => {
          started = data
        }}
      />
    </ThemeProvider>
  )
  root.renderer.flush()
  const source = root.renderer.findByTestId("drag-source-b")
  if (!source) throw new Error("Missing second source")
  const bounds = readOuterBounds(root.renderer, root.renderer.getElement(source.id))
  if (!bounds) throw new Error("Unpainted second source")
  root.renderer.nativeSimulateMouseDown(bounds.x + 10, bounds.y + 10)
  root.renderer.nativeSimulateMouseMove(bounds.x + 30, bounds.y + 15, 0)
  expect(started).toBe("second")
  expect(root.renderer.findByTestId("drag-preview")).toBeDefined()
  root.renderer.simulateKeystrokes("escape")
  expect(root.renderer.findByTestId("drag-preview")).toBeUndefined()
  root.unmount()
})
