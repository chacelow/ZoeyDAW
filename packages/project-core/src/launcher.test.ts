import { describe, expect, it } from "vitest"
import { addScene, copyClipToSlot, moveClipSlot, moveScene, removeScene } from "./launcher"
import { createTestDocument, createTestWorkspace } from "./test-fixtures"
import { parseProject, stringifyProject } from "./persistence"
import { serializeClip } from "./clip-content"

function authored() {
  const initial = createTestDocument()
  const track = initial.tracks.find(track => track.kind === "audio" && track.clips.length)
  if (!track) throw new Error("Missing audio fixture")
  const document = addScene(addScene(initial, "Verse"), "Chorus")
  const [verse, chorus] = document.launcher.scenes
  return { document, track, source: track.clips[0], verse, chorus }
}

describe("authored Session content", () => {
  it("copies independent content without placement and restores sparse scenes in their authored order", () => {
    const { document, track, source, verse, chorus } = authored()
    const before = structuredClone(source)
    const copied = copyClipToSlot(document, source.id, track.id, chorus.id)
    expect(
      copied.tracks.find(item => item.id === track.id)?.clips.find(clip => clip.id === source.id)
    ).toEqual(before)
    const reordered = moveScene(copied, chorus.id, 0)
    const restored = parseProject(stringifyProject(reordered, createTestWorkspace())).document
    expect(restored.launcher.scenes.map(scene => scene.name)).toEqual(["Chorus", "Verse"])
    const owner = restored.tracks.find(item => item.id === track.id)
    expect(owner?.clipSlots?.map(slot => slot.sceneId)).toEqual([chorus.id])
    const slot = owner?.clipSlots?.[0].clip
    expect(slot?.id).not.toBe(source.id)
    expect(slot).not.toHaveProperty("startBar")
    expect(owner?.clips.find(clip => clip.id === source.id)).toEqual(serializeClip(before))
    expect(
      removeScene(restored, verse.id).tracks.find(item => item.id === track.id)?.clipSlots
    ).toEqual(owner?.clipSlots)
    expect(
      removeScene(restored, chorus.id).tracks.find(item => item.id === track.id)?.clipSlots
    ).toEqual([])
  })

  it("rejects incompatible moves without clearing the original slot", () => {
    const { document, track, source, verse, chorus } = authored()
    const midi = document.tracks.find(track => track.kind === "midi")
    if (!midi) throw new Error("Missing MIDI fixture")
    const copied = copyClipToSlot(document, source.id, track.id, verse.id)
    expect(moveClipSlot(copied, track.id, verse.id, midi.id, chorus.id, false)).toBe(copied)
    const moved = moveClipSlot(copied, track.id, verse.id, track.id, chorus.id, false)
    const slots = moved.tracks.find(item => item.id === track.id)?.clipSlots
    expect(slots).toEqual([
      {
        sceneId: chorus.id,
        clip: copied.tracks.find(item => item.id === track.id)?.clipSlots?.[0].clip,
      },
    ])
  })

  it("rejects dangling scenes, duplicate content identities and arrangement placement inside slots", () => {
    const { document, track, source, chorus } = authored()
    const copied = copyClipToSlot(document, source.id, track.id, chorus.id)
    for (const mutate of [
      (slot: NonNullable<typeof track.clipSlots>[number]) => {
        slot.sceneId = "absent"
      },
      (slot: NonNullable<typeof track.clipSlots>[number]) => {
        slot.clip.id = source.id
      },
      (slot: NonNullable<typeof track.clipSlots>[number]) => {
        Object.assign(slot.clip, { startBar: 1 })
      },
    ]) {
      const invalid = structuredClone(copied)
      const slot = invalid.tracks.find(item => item.id === track.id)?.clipSlots?.[0]
      if (!slot) throw new Error("Missing copied slot")
      mutate(slot)
      expect(() =>
        parseProject(
          JSON.stringify({ version: 5, document: invalid, workspace: createTestWorkspace() })
        )
      ).toThrow()
    }
  })
})
