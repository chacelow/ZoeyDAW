import { afterEach, expect, it } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import { WaveformPreview } from "./WaveformPreview"

let root: TestRoot | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
})

it("preserves channel-major stereo envelopes without interleaving their pixels", () => {
  const peaks = new Float32Array([
    -1, 1, -0.5, 0.5, 0, 0.25, 0, 0, 0, 0, 0.25, 0.5, -0.75, -0.25, -1, 1,
  ])
  root = createTestRoot({ width: 100, height: 100 })
  root.render(
    <div style={{ width: 100, height: 100, position: "relative" }}>
      <WaveformPreview
        id="stereo"
        sourceId="fixture.wav"
        startBar={1}
        endBar={2}
        contentOffsetBars={0}
        width={4}
        height={80}
        top={10}
        color="black"
        opacity={1}
        readPeaks={() => peaks}
      />
    </div>
  )
  const waveform = root.renderer.findByTestId("waveform-stereo")
  if (!waveform) throw new Error("Missing waveform")
  const bounds = waveform.children.map(id => root?.renderer.getElementBounds(id))
  expect(bounds[0]).toEqual({ x: 0, y: 10, width: 1, height: 40 })
  expect(bounds[1]).toEqual({ x: 1, y: 20, width: 1, height: 20 })
  expect(bounds[4]).toEqual({ x: 0, y: 70, width: 1, height: 1 })
  expect(bounds[7]).toEqual({ x: 3, y: 50, width: 1, height: 40 })
})
