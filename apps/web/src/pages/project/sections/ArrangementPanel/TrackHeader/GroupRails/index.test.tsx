import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it } from "vitest"
import { hydrateProject, projectActions } from "@/pages/project/adapters"
import { createMockDocument, createMockWorkspace } from "@zoeydaw/project-runtime/testing"
import { GroupRails } from "."

beforeEach(() => {
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
})
afterEach(cleanup)

it("highlights only the selected ancestor's rail and restores its track color", () => {
  const group = createMockDocument(DEFAULT_TRACK_HEIGHT).tracks.find(
    track => track.kind === "group"
  )
  if (!group) throw new Error("Group fixture is required")
  const nested = { ...group, id: "nested-group", color: "var(--chart-1)" }
  const view = render(
    <GroupRails
      rails={[
        { group, closes: false },
        { group: nested, closes: true },
      ]}
    />
  )
  const rails = view.container.querySelectorAll("[data-group-rail]")
  act(() => projectActions.selectTracks([group.id], "header"))
  expect(rails[0].getAttribute("data-selected")).toBe("true")
  expect(rails[0].getAttribute("style")).toContain("var(--arrangement-clip-selected)")
  expect(rails[1].getAttribute("data-selected")).toBeNull()
  act(() => projectActions.selectTracks(["trager"], "header"))
  expect(rails[0].getAttribute("data-selected")).toBeNull()
  expect(rails[0].getAttribute("style")).toContain(group.color)
  act(() => projectActions.selectTracks([group.id], "arrangement"))
  expect(rails[0].getAttribute("data-selected")).toBeNull()
})
