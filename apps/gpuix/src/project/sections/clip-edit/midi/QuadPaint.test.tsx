import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useMemo } from "react"
import { QuadPaint, usePaintLayers } from "./QuadPaint"

function Surface({
  x,
  visible,
  strokeWidth,
}: {
  x: number
  visible: boolean
  strokeWidth: number
}) {
  const layers = useMemo(
    () =>
      visible
        ? [
            {
              key: "viewport-fill",
              color: "#fafafa",
              opacity: 0.6,
              strokeWidth,
              strokeColor: "#ab3456b3",
              rectangles: () => new Float32Array([x, 7.5, 10.5, 12.5]),
            },
          ]
        : [],
    [x, visible, strokeWidth]
  )
  const bind = usePaintLayers(layers)
  return (
    <div
      style={{
        width: 80,
        height: 60,
        backgroundColor: "#141414",
        opacity: 0.7,
        overflow: "hidden",
      }}
    >
      {layers.map(layer => (
        <QuadPaint
          key={layer.key}
          id={layer.key}
          color={layer.color}
          opacity={layer.opacity}
          strokeWidth={layer.strokeWidth}
          strokeColor={layer.strokeColor}
          bind={bind}
          width={80}
          height={60}
        />
      ))}
    </div>
  )
}

function Reference({
  x,
  visible,
  strokeWidth,
}: {
  x: number
  visible: boolean
  strokeWidth: number
}) {
  return (
    <div
      style={{
        width: 80,
        height: 60,
        backgroundColor: "#141414",
        opacity: 0.7,
        overflow: "hidden",
      }}
    >
      {visible ? (
        <div
          style={{
            position: "absolute",
            left: x,
            top: 7.5,
            width: 10.5,
            height: 12.5,
            backgroundColor: "#fafafa",
            opacity: 0.6,
            borderWidth: strokeWidth,
            borderColor: "#ab3456b3",
          }}
        />
      ) : null}
    </div>
  )
}

test("viewport uploads reach memoized hosts and survive remove/remount with native div pixel parity", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-midi-paint-"))
  const actual = createTestRoot({ width: 80, height: 60 })
  try {
    const states = [
      { x: 3.5, visible: true, strokeWidth: 1 },
      { x: 16.5, visible: true, strokeWidth: 1 },
      { x: 16.5, visible: false, strokeWidth: 1 },
      { x: -0.5, visible: true, strokeWidth: 1 },
      { x: 16.5, visible: true, strokeWidth: 0 },
    ]
    try {
      for (const [index, state] of states.entries()) {
        actual.render(<Surface {...state} />)
        actual.renderer.captureScreenshot(path.join(directory, `${index}-actual.png`))
      }
    } finally {
      actual.unmount()
    }
    expect(actual.renderer.getRetainedElementCount()).toBe(0)
    const expected = createTestRoot({ width: 80, height: 60 })
    try {
      for (const [index, state] of states.entries()) {
        expected.render(<Reference {...state} />)
        const expectedFile = path.join(directory, `${index}-expected.png`)
        expected.renderer.captureScreenshot(expectedFile)
        expect(
          readFileSync(path.join(directory, `${index}-actual.png`)).equals(
            readFileSync(expectedFile)
          )
        ).toBe(true)
      }
    } finally {
      expected.unmount()
    }
    expect(expected.renderer.getRetainedElementCount()).toBe(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
