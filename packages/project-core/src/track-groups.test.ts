import { describe, expect, it } from "vitest"
import { createTestDocument } from "./test-fixtures"
import { visibleTracks } from "./types"
import { projectTrackGroups } from "./track-groups"

describe("track group projection", () => {
  function nestedTracks() {
    const { tracks } = createTestDocument()
    const outer = tracks.find(track => track.id === "drums-group")!
    const inner = tracks.find(track => track.id === "sidechain")!
    inner.kind = "group"
    inner.collapsed = false
    inner.clips = []
    inner.childTrackIds = ["4-midi"]
    outer.childTrackIds = ["trager", inner.id]
    const midiIndex = tracks.findIndex(track => track.id === "4-midi")
    const [midi] = tracks.splice(midiIndex, 1)
    midi.output = inner.id
    tracks.splice(tracks.indexOf(inner) + 1, 0, midi)
    return tracks
  }

  it("connects nested ancestor rails and closes only the final descendant branch", () => {
    const projection = projectTrackGroups(visibleTracks(nestedTracks()))
    expect(projection.railsByTrackId.get("trager")?.map(rail => rail.closes)).toEqual([false])
    expect(projection.railsByTrackId.get("sidechain")?.map(rail => rail.closes)).toEqual([false])
    expect(
      projection.railsByTrackId.get("4-midi")?.map(rail => [rail.group.id, rail.closes])
    ).toEqual([
      ["drums-group", true],
      ["sidechain", true],
    ])
  })

  it("closes a folded final child group while retaining its descendant summary", () => {
    const tracks = nestedTracks()
    tracks.find(track => track.id === "sidechain")!.collapsed = true
    const projection = projectTrackGroups(visibleTracks(tracks))
    expect(projection.railsByTrackId.get("sidechain")?.map(rail => rail.closes)).toEqual([true])
    expect(projection.railsByTrackId.has("4-midi")).toBe(false)
    const fullProjection = projectTrackGroups(tracks)
    expect(
      fullProjection.leafDescendantsByGroupId.get("drums-group")?.map(track => track.id)
    ).toEqual(["trager", "4-midi"])
    expect(
      fullProjection.leafDescendantsByGroupId.get("sidechain")?.map(track => track.id)
    ).toEqual(["4-midi"])
  })

  it("ends sibling enclosures independently without adding a group's own rail", () => {
    const { tracks } = createTestDocument()
    const outer = tracks.find(track => track.id === "drums-group")!
    const sibling = { ...outer, id: "second-group", childTrackIds: ["4-midi"] }
    const grouped = [...tracks.slice(0, 3), sibling, ...tracks.slice(3)]
    const projection = projectTrackGroups(grouped)
    expect(projection.railsByTrackId.get(outer.id)).toEqual([])
    expect(projection.railsByTrackId.get(sibling.id)).toEqual([])
    expect(
      projection.railsByTrackId.get("sidechain")?.map(rail => [rail.group.id, rail.closes])
    ).toEqual([[outer.id, true]])
    expect(
      projection.railsByTrackId.get("4-midi")?.map(rail => [rail.group.id, rail.closes])
    ).toEqual([[sibling.id, true]])
    expect(projection.railsByTrackId.get("3-audio")).toEqual([])
  })
})
