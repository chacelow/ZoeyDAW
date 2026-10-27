import { expect, it } from "vitest"
import { detectWaveformTransients } from "./transient-detection"

it("finds actual attacks without inventing a grid for silence", () => {
  const quiet = Array.from({ length: 100 }, () => 0)
  const peaks = [...quiet]
  for (const index of [10, 40, 75]) peaks[index] = 0.8
  expect(detectWaveformTransients(peaks, 1)).toEqual([0.1, 0.4, 0.75])
  expect(detectWaveformTransients(quiet, 1)).toEqual([])
})
