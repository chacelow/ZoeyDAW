import { beforeEach, describe, expect, it } from "bun:test"
import { hydrateProject, projectActions, serializeProject } from "../adapters"
import { createMockDocument, createMockWorkspace } from "../adapters/fixtures"
import type { DocumentState } from "./types"

beforeEach(() => {
  hydrateProject(
    JSON.stringify({ version: 2, document: createMockDocument(), workspace: createMockWorkspace() })
  )
})

const invalidDocuments: { name: string; mutate: (document: DocumentState) => void }[] = [
  {
    name: "a second main output",
    mutate(document) {
      const main = document.tracks.find(track => track.id === "main")!
      document.tracks.push({ ...structuredClone(main), id: "other-main" })
    },
  },
  {
    name: "an audio clip on a MIDI track",
    mutate(document) {
      const clip = document.tracks.find(track => track.id === "3-audio")!.clips[0]
      document.tracks.find(track => track.id === "4-midi")!.clips = [
        { ...structuredClone(clip), id: "cross-kind" },
      ]
    },
  },
  {
    name: "a clip owned by a group bus",
    mutate(document) {
      const clip = document.tracks.find(track => track.id === "trager")!.clips[0]
      document.tracks.find(track => track.id === "drums-group")!.clips = [
        { ...structuredClone(clip), id: "bus-clip" },
      ]
    },
  },
]

describe("project topology construction", () => {
  it.each(invalidDocuments)("rejects $name without changing the active project", ({ mutate }) => {
    projectActions.setBpm(130)
    const before = serializeProject()
    const document = createMockDocument()
    mutate(document)
    expect(() =>
      hydrateProject(JSON.stringify({ version: 2, document, workspace: createMockWorkspace() }))
    ).toThrow()
    expect(serializeProject()).toBe(before)
  })
})
