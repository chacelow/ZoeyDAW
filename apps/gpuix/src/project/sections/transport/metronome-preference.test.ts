import { beforeEach, expect, test } from "bun:test"
import { hydrateProject, projectActions, serializeProject, useProjectState } from "../../adapters"
import { createMockDocument, createMockWorkspace } from "../../adapters/fixtures"
import { parseProject } from "../../model/persistence"

beforeEach(() =>
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
)

test("metronome preference toggles independently and restores through undo and snapshots", () => {
  projectActions.setMetronome(false)
  expect(useProjectState.getState().workspace.metronome).toBe(false)
  const snapshot = serializeProject()
  projectActions.undo()
  expect(useProjectState.getState().workspace.metronome).toBe(true)
  hydrateProject(snapshot)
  expect(useProjectState.getState().workspace.metronome).toBe(false)
  expect(useProjectState.getState().session.playing).toBe(false)
})

test("legacy snapshots acquire metronome default without changing other workspace preferences", () => {
  const workspace: Record<string, unknown> = { ...createMockWorkspace(), follow: false }
  delete workspace.metronome
  const parsed = parseProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace })
  )
  expect(parsed.workspace.metronome).toBe(true)
  expect(parsed.workspace.follow).toBe(false)
})

test("invalid explicit metronome preferences reject atomically", () => {
  projectActions.setMetronome(false)
  expect(() =>
    hydrateProject(
      JSON.stringify({
        version: 2,
        document: createMockDocument(),
        workspace: { ...createMockWorkspace(), metronome: "enabled" },
      })
    )
  ).toThrow()
  expect(useProjectState.getState().workspace.metronome).toBe(false)
})
