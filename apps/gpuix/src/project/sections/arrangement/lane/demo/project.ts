import { hydrateProject, useProjectState } from "@/project/adapters"
import { createClip, createTrack } from "@/project/model/reducers"
import type { Track } from "@/project/model/types"
import { PATTERN_STEPS_PER_BAR } from "@/project/model/types"
import { defaultAudioClipSettings } from "@/project/model/audio-editor"
import { DEFAULT_TRACK_HEIGHT } from "@/project/layout"
import { CONTENT_PALETTE } from "@/shared/theme/content-color"

export function seedLaneProject(mediaUri: string, stress: boolean): void {
  const current = useProjectState.getState()
  const document = structuredClone(current.document)
  const workspace = structuredClone(current.workspace)
  const main = document.tracks.find(track => track.kind === "main")
  if (!main) throw new Error("Verification project requires the existing Main output")
  document.name = "Lane native verification"
  document.transport = {
    ...document.transport,
    bpm: 120,
    numerator: 4,
    denominator: 4,
    loop: { enabled: false, startBar: 1, endBar: 9 },
  }
  main.volumeDb = -30
  const tracks: Track[] = []
  const count = stress ? 200 : 4
  const clipsPerTrack = stress ? 50 : 3
  for (let index = 0; index < count; index++) {
    const kind = index % 3 === 0 ? "audio" : index % 3 === 1 ? "midi" : "pattern"
    const track = createTrack(
      kind === "audio" ? "audio" : "midi",
      tracks,
      undefined,
      DEFAULT_TRACK_HEIGHT
    )
    track.name = `Track ${String(index + 1).padStart(3, "0")}`
    track.color = CONTENT_PALETTE[index % CONTENT_PALETTE.length] ?? CONTENT_PALETTE[0]
    track.output = "main"
    track.volumeDb = -30
    for (let item = 0; item < clipsPerTrack; item++) {
      const clip = createClip(kind, 1 + item * (stress ? 4 : 6), stress ? 2 : 4)
      clip.label = `Track ${String(index + 1).padStart(3, "0")} Clip ${String(item + 1).padStart(2, "0")}`
      clip.sourceOffsetBars = (item % 4) / 4
      if (clip.kind === "audio") {
        clip.samplePath = mediaUri
        clip.gainDb = -6
        clip.fadeInBars = stress ? 0.25 : 0.75
        clip.fadeOutBars = stress ? 0.25 : 0.5
        clip.audioSettings = defaultAudioClipSettings(120, {
          sourceOffsetBars: clip.sourceOffsetBars,
          lengthBars: 1,
        })
      } else if (clip.kind === "midi") {
        clip.loopBars = 1
        clip.notes = [60, 64, 67, 72].map((pitch, note) => ({
          id: `note-${index}-${item}-${note}`,
          pitch,
          startBeat: note,
          lengthBeats: 0.5,
          velocity: 75,
        }))
      } else {
        clip.steps = Array.from(
          { length: PATTERN_STEPS_PER_BAR },
          (_, step) => step % 4 === index % 4
        )
      }
      track.clips.push(clip)
    }
    track.automation = [
      {
        id: `${track.id}-volume`,
        parameter: "volume",
        points: [
          { id: `${track.id}-a`, bar: 1.5, value: 0.4 },
          { id: `${track.id}-b`, bar: 3, value: 0.8, curve: 0.25 },
          { id: `${track.id}-c`, bar: 8, value: 0.6 },
        ],
      },
    ]
    tracks.push(track)
  }
  if (!stress) {
    const group = createTrack("group", tracks, undefined, DEFAULT_TRACK_HEIGHT)
    group.name = "Group"
    group.color = CONTENT_PALETTE[2]
    group.childTrackIds = tracks.slice(0, 2).map(track => track.id)
    for (const track of tracks.slice(0, 2)) track.output = group.id
    tracks.unshift(group)
    const returnTrack = createTrack("return", tracks, undefined, DEFAULT_TRACK_HEIGHT)
    returnTrack.name = "Return"
    returnTrack.color = CONTENT_PALETTE[3]
    tracks.push(returnTrack)
  }
  document.tracks = [...tracks, main]
  document.markers = []
  workspace.pxPerBar = stress ? 8 : 64
  workspace.scrollX = 0
  workspace.scrollY = 0
  workspace.grid = { mode: "fixed", bars: 0.25 }
  workspace.snap = true
  workspace.follow = true
  workspace.automationMode = false
  workspace.drawMode = false
  workspace.computerKeyboard = false
  hydrateProject(JSON.stringify({ version: 2, document, workspace }))
}
