import { strict as assert } from "node:assert"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { handleGpuixEvent } from "@gpuix/react"
import {
  projectActions,
  setProjectStorageId,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { mount } from "../harness.test"
import type { Harness } from "../harness.test"

const output = process.env.B2_EVIDENCE_DIR
if (!output) throw new Error("B2_EVIDENCE_DIR must name an external evidence directory")
mkdirSync(output, { recursive: true })
setProjectStorageId("r2-sections-native-smoke")
const id = "native-midi-clip"
const readNotes = () => {
  const clip = useProjectState
    .getState()
    .document.tracks.flatMap(track => track.clips)
    .find(clip => clip.id === id)
  if (clip?.kind !== "midi") throw new Error("Missing native MIDI fixture")
  return clip.notes
}
const release = startProjectRuntime()
let view: Harness | undefined
try {
  assert.equal(await whenProjectBackendIdle(), true)
  const original = [
    { id: "a", pitch: 72, startBeat: 0, lengthBeats: 1, velocity: 90 },
    { id: "b", pitch: 64, startBeat: 3, lengthBeats: 1, velocity: 80 },
  ]
  projectActions.updateClip(id, { notes: original })
  await whenProjectBackendIdle()
  projectActions.updateClip(id, { notes: original.slice(1) })
  await whenProjectBackendIdle()
  view = mount(id)
  view.key("midi-grid", "cmd-a cmd-z")
  await whenProjectBackendIdle()
  view.key("midi-grid", "up")
  await whenProjectBackendIdle()
  assert.deepEqual(
    readNotes().map(note => [note.id, note.pitch]),
    [
      ["a", 72],
      ["b", 65],
    ]
  )
  view.key("midi-grid", "cmd-a cmd-x cmd-v")
  await whenProjectBackendIdle()
  assert.deepEqual(
    readNotes().map(note => [note.startBeat, note.pitch]),
    [
      [0.25, 72],
      [3.25, 65],
    ]
  )
  const beforeZoom = structuredClone(readNotes())
  const box = view.bounds(`midi-note-${beforeZoom[1]?.id}`)
  const body = view.root.renderer.findByTestId("midi-body")
  const grid = view.root.renderer.findByTestId("midi-grid")
  if (!body || !grid) throw new Error("Missing native MIDI event owners")
  const x = box.x + 2
  const y = box.y + box.height / 2
  view.root.renderer.nativeSimulateMouseDown(x, y)
  view.root.renderer.nativeSimulateMouseMove(x + 80, y, 0)
  await whenProjectBackendIdle()
  assert.notDeepEqual(readNotes(), beforeZoom)
  handleGpuixEvent(
    {
      elementId: body.id,
      eventType: "scroll",
      x,
      y,
      deltaY: 120,
      modifiers: { cmd: true, shift: false, ctrl: false, alt: false },
    },
    view.root.renderer
  )
  handleGpuixEvent(
    { elementId: grid.id, eventType: "mouseUp", x: x + 80, y, button: 0 },
    view.root.renderer
  )
  await whenProjectBackendIdle()
  assert.deepEqual(readNotes(), beforeZoom)
  assert.equal(useProjectState.getState().session.backend.phase, "ready")
  assert.equal(useProjectState.getState().session.backend.error, null)
  view.root.renderer.captureScreenshot(path.join(output, "r2-midi.png"))
  console.log(
    JSON.stringify({
      backend: useProjectState.getState().session.backend,
      notes: readNotes(),
      screenshot: path.join(output, "r2-midi.png"),
    })
  )
} finally {
  view?.unmount()
  release()
}
