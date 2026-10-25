import { expect, it } from "vitest"
import { controlGenerationValue } from "./protocol"

it("parses control generations as bounded u64 BigInts rather than lossy numbers", () => {
  expect(controlGenerationValue("9007199254740993")).toBe(9007199254740993n)
  expect(controlGenerationValue("18446744073709551615")).toBe(18446744073709551615n)
  for (const value of ["18446744073709551616", "-1", "01", "1.5", "", 1]) {
    expect(controlGenerationValue(value)).toBeNull()
  }
})
