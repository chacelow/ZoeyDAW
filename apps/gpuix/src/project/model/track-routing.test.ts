import { expect, test } from "bun:test"
import { routeTrack } from "../adapters/runtime/track-routing"
import { canRouteTrack, routingDestinations } from "./track-routing"
import type { Track } from "./types"

function track(id: string, kind: Track["kind"], output: string): Track {
  return {
    id,
    kind,
    name: id,
    output,
    color: "content-color",
    input: "none",
    mute: false,
    solo: false,
    armed: false,
    volumeDb: 0,
    pan: 0,
    heightPx: 70,
    clips: [],
    automation: [],
    monitor: "off",
  }
}

function tree(random: () => number): Track[] {
  const tracks = [track("main", "main", "external")]
  for (let index = 0; index < 16; index++) {
    const groups = tracks.filter(item => item.kind === "main" || item.kind === "group")
    const parent = groups[Math.floor(random() * groups.length)]
    if (!parent) throw new Error("Missing tree parent")
    const child = track(`track-${index}`, random() < 0.6 ? "group" : "audio", parent.id)
    if (parent.kind === "group") parent.childTrackIds = [...(parent.childTrackIds ?? []), child.id]
    tracks.push(child)
  }
  return tracks
}

test("routing candidates and authored routing share legality over random grouping trees", () => {
  let seed = 75956
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  for (let sample = 0; sample < 200; sample++) {
    const tracks = tree(random)
    const before = structuredClone(tracks)
    for (const source of tracks) {
      const candidates = routingDestinations(source, tracks)
      for (const destination of tracks) {
        const allowed = candidates.includes(destination)
        expect(canRouteTrack(source.id, destination.id, tracks)).toBe(allowed)
        const routed = routeTrack(tracks, source.id, { output: destination.id })
        expect(routed !== null).toBe(allowed)
        if (routed) {
          expect(routed.find(item => item.id === source.id)?.output).toBe(destination.id)
          expect(routed.find(item => item.id === source.id)?.kind).toBe(source.kind)
        }
      }
      expect(canRouteTrack(source.id, "none", tracks)).toBe(true)
      expect(canRouteTrack(source.id, "external", tracks)).toBe(true)
      expect(canRouteTrack(source.id, "missing", tracks)).toBe(false)
    }
    expect(tracks).toEqual(before)
  }
})

test("rejects a descendant even when its output does not yet lead back to the group", () => {
  const parent = track("parent", "group", "main")
  parent.childTrackIds = ["child"]
  const tracks = [track("main", "main", "external"), parent, track("child", "group", "external")]
  expect(canRouteTrack("parent", "child", tracks)).toBe(false)
  expect(routeTrack(tracks, "parent", { output: "child" })).toBeNull()
  expect(routingDestinations(parent, tracks).map(item => item.id)).toEqual(["main"])
})

test("rejects an output loop independently from group ancestry", () => {
  const tracks = [
    track("main", "main", "external"),
    track("a", "group", "b"),
    track("b", "group", "a"),
  ]
  expect(canRouteTrack("main", "a", tracks)).toBe(false)
  expect(canRouteTrack("a", "b", tracks)).toBe(false)
  expect(canRouteTrack("missing", "external", tracks)).toBe(false)
})
