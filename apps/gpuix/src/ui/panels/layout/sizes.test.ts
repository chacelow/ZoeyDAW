import { expect, test } from "bun:test"
import { fitLayout, initialLayout, reflowLayout, resolveConstraints } from "./sizes"

test("flexible pixel minima above the viewport relax proportionally instead of becoming fixed", () => {
  const constraints = resolveConstraints([{ minSize: 160 }, { minSize: 80 }], 60)
  expect(fitLayout([160, 80], constraints, 60)).toEqual([40, 20])
  expect(initialLayout([undefined, undefined], constraints, 60)).toEqual([40, 20])
  expect(reflowLayout([160, 80], constraints, 60)).toEqual([40, 20])
})

test("declared fixed panels retain their reservation and still reject an undersized viewport", () => {
  const constraints = resolveConstraints([{ minSize: 40, maxSize: 40 }, { minSize: 160 }], 60)
  expect(fitLayout([40, 160], constraints, 60)).toEqual([40, 20])
  expect(() =>
    fitLayout(
      [80, 160],
      resolveConstraints([{ minSize: 80, maxSize: 80 }, { minSize: 160 }], 60),
      60
    )
  ).toThrow("Fixed panels exceed the available size")
})
