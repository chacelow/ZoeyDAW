import { describe, expect, it } from "vitest"
import { parseProject } from "./persistence"
import { reduceDocument } from "./reducers"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"

describe("transport denominator boundary", () => {
  it.each([1, 2, 4, 8, 16, 32])("accepts native-compatible denominator %s", denominator => {
    const document = createTestDocument()
    const edited = reduceDocument(document, { type: "transport", patch: { denominator } })
    expect(edited.transport.denominator).toBe(denominator)
    const restored = parseProject(
      JSON.stringify({ version: 4, document: edited, workspace: createTestWorkspace() })
    )
    expect(restored.document.transport.denominator).toBe(denominator)
  })

  it.each([0, -2, 3, 5, 6, 7, 12, 31, 33, 64, 1.5, NaN, Infinity])(
    "rejects denominator %s atomically before backend projection",
    denominator => {
      const document = createTestDocument()
      expect(
        reduceDocument(document, { type: "transport", patch: { denominator, bpm: 133 } })
      ).toBe(document)
    }
  )

  it.each([1, 2, 3, 4])("rejects unsupported denominators in snapshot version %s", version => {
    const document = createTestDocument()
    document.transport.denominator = 3
    expect(() =>
      parseProject(JSON.stringify({ version, document, workspace: createTestWorkspace() }))
    ).toThrow()
    expect(document.transport.denominator).toBe(3)
  })
})
