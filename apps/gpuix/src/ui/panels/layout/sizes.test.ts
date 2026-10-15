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

test("mixed-unit panel bounds remain flexible when a shrinking viewport crosses their minimum", () => {
  const constraints = resolveConstraints([{ minSize: 160, maxSize: "100%" }, {}], 60)
  expect(fitLayout([160, 0], constraints, 60)).toEqual([60, 0])
  expect(initialLayout([undefined, undefined], constraints, 60)).toEqual([60, 0])
  expect(reflowLayout([160, 0], constraints, 60)).toEqual([60, 0])
  const reverseUnits = resolveConstraints([{ minSize: "100%", maxSize: 160 }, {}], 200)
  expect(fitLayout([200, 0], reverseUnits, 100)).toEqual([100, 0])
})
