import { expect, it } from "vitest"
import { createDevice } from "./devices"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import { parseProject, stringifyProject } from "./persistence"
import {
  createRack,
  isRack,
  selectRackChain,
  setRackChainSelector,
  setRackMacroValue,
  type RackChain,
} from "./racks"

const chain: RackChain = {
  id: "chain-a",
  name: "A",
  devices: [createDevice("utility")],
  volumeDb: 0,
  pan: 0,
  mute: false,
  solo: false,
  selectorStart: 0,
  selectorEnd: 63,
}

it("supports selector, selected chain, and macro changes without mutating the source rack", () => {
  const source = {
    ...createRack("midi-1"),
    chains: [chain],
    selectedChainId: "chain-a",
    macros: [{ id: "macro-a", name: "Macro", value: 0.25, mappings: [] }],
  }
  const selected = selectRackChain(source, "chain-a")
  const moved = setRackChainSelector(selected, 48)
  const changed = setRackMacroValue(moved, "macro-a", 0.75)

  expect(isRack(changed)).toBe(true)
  expect(changed.chainSelector).toBe(48)
  expect(changed.macros[0].value).toBe(0.75)
  expect(source.chainSelector).toBe(0)
  expect(source.macros[0].value).toBe(0.25)
})

it("roundtrips rack state and rejects an owner outside the document", () => {
  const document = createTestDocument()
  const rack = { ...createRack("4-midi"), chains: [chain] }
  const restored = parseProject(
    stringifyProject({ ...document, racks: [rack] }, createTestWorkspace())
  )
  expect(restored.document.racks).toEqual([rack])

  const invalid = JSON.parse(stringifyProject(document, createTestWorkspace()))
  invalid.document.racks = [{ ...rack, ownerTrackId: "missing" }]
  expect(() => parseProject(JSON.stringify(invalid))).toThrow(
    "Invalid or unsupported project snapshot"
  )
})

it("rejects selector ranges and duplicate chain identities", () => {
  expect(isRack({ ...createRack("4-midi"), chains: [{ ...chain, selectorEnd: 128 }] })).toBe(false)
  expect(
    isRack({
      ...createRack("4-midi"),
      chains: [chain, { ...chain, devices: [createDevice("delay")] }],
    })
  ).toBe(false)
})
