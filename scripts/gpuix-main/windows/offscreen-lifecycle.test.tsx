import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { TestRenderer } from "@gpuix/native/testing"
import { decodeNativePng } from "../../../apps/gpuix/src/shared/waveform/testing/native-png"

if (process.platform !== "win32")
  throw new Error("This regression requires Windows DirectComposition")
if (["1", "true"].includes(process.env.GPUI_DISABLE_DIRECT_COMPOSITION ?? ""))
  throw new Error("DirectComposition must be enabled for the native window lifetime regression")

test("replacing 320 offscreen windows releases native DirectComposition resources", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "gpuix-offscreen-lifetime-"))
  try {
    for (let index = 0; index < 320; index++) {
      const root = createTestRoot({ width: 32, height: 32 })
      try {
        const blue = index % 2 === 1
        root.render(
          <div
            testId="lifetime"
            style={{ width: 32, height: 32, backgroundColor: blue ? "#0000ff" : "#ff0000" }}
          />
        )
        if (index === 0 || index === 319) {
          const filename = path.join(directory, `window-${index}.png`)
          root.renderer.captureScreenshot(filename)
          const image = decodeNativePng(readFileSync(filename))
          expect([image.width, image.height]).toEqual([32, 32])
          const offset = (16 * image.width + 16) * 4
          expect([...image.rgba.subarray(offset, offset + 4)]).toEqual(
            blue ? [0, 0, 255, 255] : [255, 0, 0, 255]
          )
        }
      } finally {
        root.unmount()
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 60_000)

test("disposing a superseded renderer cannot close the active native window", () => {
  const previous = new TestRenderer({ width: 20, height: 20 })
  const current = new TestRenderer({ width: 33, height: 31 })
  try {
    previous.dispose()
    expect(current.getWindowSize()).toEqual({ width: 33, height: 31 })
  } finally {
    current.dispose()
    current.dispose()
  }
  const replacement = new TestRenderer({ width: 37, height: 35 })
  try {
    expect(replacement.getWindowSize()).toEqual({ width: 37, height: 35 })
  } finally {
    replacement.dispose()
  }
})

test("unmounting a superseded root preserves the active window keyboard owner", () => {
  const previous = createTestRoot({ width: 40, height: 40 })
  previous.render(<div />)
  const received: string[] = []
  const current = createTestRoot({
    width: 50,
    height: 50,
    onKeyDown: event => {
      received.push(event.key ?? "")
    },
  })
  try {
    current.render(
      <div testId="current" role="application" tabIndex={0} style={{ width: 30, height: 30 }} />
    )
    previous.unmount()
    const host = current.renderer.findByTestId("current")
    if (!host) throw new Error("Active window host is missing")
    current.renderer.nativeSimulateKeystrokes(host.id, "home")
    expect(received).toEqual(["home"])
  } finally {
    current.unmount()
    previous.unmount()
  }
})
