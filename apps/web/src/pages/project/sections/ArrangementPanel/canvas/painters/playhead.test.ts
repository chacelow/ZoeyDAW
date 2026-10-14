// @vitest-environment jsdom
import { expect, it } from "vitest"
import { createMockDocument } from "@/pages/project/adapters/fixtures"
import { createAudioRingBuffer } from "../audio/ring-buffer"
import { layoutTrackRows } from "../layout"
import { createSceneStore } from "../scene"
import { paintClipAlignment, paintPlayhead } from "./playhead"

it("paints only the chosen visible row while stopped and a full recording line while playing", () => {
  const document = createMockDocument()
  const scene = createSceneStore()
  scene.setMusic({
    bars: 256,
    grid: { mode: "adaptive", density: "narrowest" },
    transport: document.transport,
    markers: document.markers,
    loop: document.transport.loop,
    tracks: document.tracks,
  })
  scene.setViewport({ pxPerBar: 64, scrollX: 8 * 64, scrollY: 0, width: 900, height: 700, dpr: 1 })
  const lines: { from: [number, number]; to: [number, number]; color: string }[] = []
  const fills: string[] = []
  let from: [number, number] = [0, 0]
  let to: [number, number] = [0, 0]
  const context = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      from = [x, y]
    },
    lineTo(x: number, y: number) {
      to = [x, y]
    },
    closePath() {},
    stroke() {
      lines.push({ from, to, color: this.strokeStyle })
    },
    fill() {
      fills.push(this.fillStyle)
    },
  }
  const ring = createAudioRingBuffer()
  const tokens = { primary: "teal", recording: "red" }
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([])
  ring.writePlayhead({ bar: 10, playing: true, recording: true })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([])
  const audioRow = layoutTrackRows(scene.get()).find(row => row.track.id === "3-audio")!
  scene.setPlayback({ playing: false, insertionPoint: { trackId: "3-audio", bar: 9.25 } })
  ring.writePlayhead({ bar: 10, playing: true, recording: true })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([
    {
      from: [16.5, audioRow.top],
      to: [16.5, audioRow.top + audioRow.height],
      color: "teal",
    },
  ])
  expect(fills).toEqual(["teal"])
  lines.length = 0
  scene.setPlayback({ playing: true, insertionPoint: scene.get().playback.insertionPoint })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([{ from: [64.5, 34], to: [64.5, 682], color: "red" }])
  lines.length = 0
  scene.setPlayback({ playing: false, insertionPoint: scene.get().playback.insertionPoint })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toHaveLength(1)
  expect(lines[0].to[1]).toBe(audioRow.top + audioRow.height)
  lines.length = 0
  const audio = document.tracks.find(track => track.id === "3-audio")!
  const ghostTracks = document.tracks.map(track =>
    track.id === audio.id
      ? { ...track, clips: [{ ...audio.clips[0], id: "preview-audio-1", startBar: 11.5 }] }
      : track
  )
  scene.setClipDrag({ source: document.tracks, ids: new Set(["preview-audio-1"]) })
  scene.setProjectPreview({
    kind: "tracks",
    token: { sessionId: "renderer", id: "move" },
    tracks: ghostTracks,
  })
  paintPlayhead(context, scene.get(), ring, tokens)
  paintClipAlignment(context, scene.get(), "gray")
  expect(lines).toEqual([
    { from: [16.5, audioRow.top], to: [16.5, audioRow.top + audioRow.height], color: "teal" },
    { from: [160.5, 34], to: [160.5, 682], color: "gray" },
  ])
  lines.length = 0
  scene.setPlayback({ playing: true, insertionPoint: scene.get().playback.insertionPoint })
  paintPlayhead(context, scene.get(), ring, tokens)
  paintClipAlignment(context, scene.get(), "gray")
  expect(lines).toEqual([
    { from: [64.5, 34], to: [64.5, 682], color: "red" },
    { from: [160.5, 34], to: [160.5, 682], color: "gray" },
  ])
  lines.length = 0
  scene.setClipDrag(null)
  scene.setProjectPreview(null)
  scene.setPlayback({ playing: false, insertionPoint: scene.get().playback.insertionPoint })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([
    { from: [16.5, audioRow.top], to: [16.5, audioRow.top + audioRow.height], color: "teal" },
  ])
  lines.length = 0
  scene.setClipResize({ id: "audio-1", edge: "left" })
  scene.setProjectPreview({
    kind: "tracks",
    token: { sessionId: "renderer", id: "resize" },
    tracks: document.tracks.map(track =>
      track.id === audio.id
        ? { ...track, clips: [{ ...audio.clips[0], startBar: 11.5, lengthBars: 4 }] }
        : track
    ),
  })
  paintClipAlignment(context, scene.get(), "gray")
  expect(lines).toEqual([{ from: [160.5, 34], to: [160.5, 682], color: "gray" }])
  lines.length = 0
  scene.setClipResize({ id: "audio-1", edge: "right" })
  paintClipAlignment(context, scene.get(), "gray")
  expect(lines).toEqual([{ from: [416.5, 34], to: [416.5, 682], color: "gray" }])
  scene.setClipResize(null)
  scene.setProjectPreview(null)
  lines.length = 0
  paintClipAlignment(context, scene.get(), "gray")
  expect(lines).toEqual([])
  lines.length = 0
  const folded = document.tracks.map(track =>
    track.id === "drums-group" ? { ...track, collapsed: true } : track
  )
  scene.setPlayback({ playing: false, insertionPoint: { trackId: "trager", bar: 9.25 } })
  scene.setMusic({ ...scene.get(), tracks: folded })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([])
  scene.setPlayback({ playing: false, insertionPoint: { trackId: "3-audio", bar: 9.25 } })
  scene.setMusic({
    ...scene.get(),
    tracks: document.tracks.filter(track => track.id !== "3-audio"),
  })
  paintPlayhead(context, scene.get(), ring, tokens)
  expect(lines).toEqual([])
  ring.dispose()
})
