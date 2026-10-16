import { afterEach, beforeEach, expect, test } from "bun:test"
import { flushSync, handleGpuixEvent } from "@gpuix/react"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { clipEditorLabels } from "@/app/locales/sections/clip-edit"
import { configurePreferences, createPreferenceOwner } from "@/platform/settings"
import type { PreferenceOwner } from "@/platform/settings"
import { projectActions } from "@/project/adapters"
import { getAudioClipSettings } from "@/project/model/audio-editor"
import { AUDIO_ID, MIDI_ID, clipById, mount, notes, seed } from "./harness.test"
import type { Harness } from "./harness.test"

let directory: string
let owner: PreferenceOwner
let restore: () => void
let view: Harness | undefined
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-editor-preferences-"))
  owner = createPreferenceOwner({ configDir: directory })
  restore = configurePreferences(owner)
  seed()
})
afterEach(() => {
  view?.unmount()
  view = undefined
  restore()
  seed()
  rmSync(directory, { recursive: true, force: true })
})

test("note insertion, draw, movement and quantization consume distinct current MIDI preferences", () => {
  owner.setPreference("midi", {
    ...owner.getPreference("midi"),
    velocity: 73,
    insertLengthBeats: 1.5,
    drawLengthBeats: 0.75,
    noteGridBeats: 0.5,
    quantizeBeats: 1,
  })
  const h = (view = mount())
  const grid = h.bounds("midi-grid")
  const row = h.bounds("midi-key-70")
  const element = h.root.renderer.findByTestId("midi-grid")
  if (!element) throw new Error("Missing MIDI grid")
  flushSync(() =>
    handleGpuixEvent(
      {
        elementId: element.id,
        eventType: "mouseDown",
        x: grid.x + grid.width * 0.39,
        y: row.y + row.height / 2,
        button: 0,
        clickCount: 2,
      },
      h.root.renderer
    )
  )
  expect(notes().at(-1)).toMatchObject({
    pitch: 70,
    startBeat: 3.5,
    lengthBeats: 1.5,
    velocity: 73,
  })
  h.key("midi-grid", "cmd-u")
  expect(notes().at(-1)?.startBeat).toBe(4)
  h.key("midi-grid", "right")
  expect(notes().at(-1)?.startBeat).toBe(4.5)

  projectActions.setMode("drawMode", true)
  const drawRow = h.bounds("midi-key-69")
  const x = grid.x + grid.width * 0.14
  const y = drawRow.y + drawRow.height / 2
  h.root.renderer.nativeSimulateMouseDown(x, y, 0)
  h.root.renderer.nativeSimulateMouseUp(x, y)
  expect(notes().at(-1)).toMatchObject({
    pitch: 69,
    startBeat: 2.5,
    lengthBeats: 0.75,
    velocity: 73,
  })
})

test("empty folded editor follows initial pitch, octave naming and live fold preference", () => {
  owner.setPreference("midi", {
    ...owner.getPreference("midi"),
    fold: true,
    initialPitch: 67,
    octaveLabelOffset: -1,
  })
  seed(clips => {
    const clip = clips.find(item => item.id === MIDI_ID)
    if (clip?.kind === "midi") clip.notes = []
  })
  const h = (view = mount())
  expect(h.root.renderer.findByTestId("midi-key-67")).toBeDefined()
  expect(h.root.renderer.findByTestId("midi-key-60")).toBeUndefined()
  expect(h.root.renderer.getAutomationTree()).toContain("G4")
  flushSync(() => owner.setPreference("midi", { ...owner.getPreference("midi"), fold: false }))
  h.render()
  expect(h.root.renderer.findByTestId("midi-key-66")).toBeDefined()
})

test("numeric and gain displays use injected formatter behavior rather than section literals", () => {
  const labels = clipEditorLabels.en
  const formats = {
    ...labels.midi.formats,
    number: (value: number) => `n:${value}`,
    pitchName: (pitch: number) => `pitch:${pitch}`,
    audioGain: (value: number) => `gain:${value}`,
    zoom: (value: number) => `zoom:${value}`,
  }
  const h = (view = mount(
    MIDI_ID,
    { width: 900, height: 360 },
    {
      ...labels,
      midi: { ...labels.midi, formats },
      audio: { ...labels.audio, formats },
    }
  ))
  expect(h.root.renderer.getPaintedText().join(" ")).toContain("n:1")
  expect(h.root.renderer.getAutomationTree()).toContain("pitch:64")
  h.render(AUDIO_ID)
  const clip = clipById(AUDIO_ID)
  if (clip.kind !== "audio") throw new Error("Expected audio clip")
  expect(h.root.renderer.getPaintedText().join(" ")).toContain(`gain:${clip.gainDb}`)
  expect(h.root.renderer.getPaintedText().join(" ")).toContain("zoom:")
})

test("audio tuning reset consumes current audio defaults without changing other settings", () => {
  owner.setPreference("audio", { ...owner.getPreference("audio"), transpose: 7, detune: -12 })
  const h = (view = mount(AUDIO_ID))
  for (const field of ["transpose", "detune"] as const) {
    const element = h.root.renderer.findByTestId(`audio-${field}`)
    const box = h.bounds(`audio-${field}`)
    if (!element) throw new Error(`Missing audio ${field}`)
    handleGpuixEvent(
      {
        elementId: element.id,
        eventType: "mouseDown",
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        button: 0,
        clickCount: 2,
      },
      h.root.renderer
    )
    const clip = clipById(AUDIO_ID)
    if (clip.kind !== "audio") throw new Error("Expected audio clip")
    expect(getAudioClipSettings(clip, 120)[field]).toBe(owner.getPreference("audio")[field])
  }
})

test("MIDI numeric width follows the injected locale width samples", () => {
  const h = (view = mount())
  const originalWidth = h.bounds("midi-loop-bars").width
  h.unmount()
  view = undefined
  const labels = clipEditorLabels.en
  const wide = (view = mount(
    MIDI_ID,
    { width: 900, height: 360 },
    {
      ...labels,
      midi: {
        ...labels.midi,
        formats: {
          ...labels.midi.formats,
          widthSamples: {
            ...labels.midi.formats.widthSamples,
            midi: ["999999999999999999999999.9375"],
          },
        },
      },
    }
  ))
  expect(wide.bounds("midi-loop-bars").width).toBeGreaterThan(originalWidth + 20)
})

test("time zoom consumes current viewport factor and maximum", () => {
  owner.setPreference("midiViewport", {
    ...owner.getPreference("midiViewport"),
    horizontalFactor: 3,
    horizontalMax: 3,
  })
  const h = (view = mount())
  const grid = h.bounds("midi-grid")
  const original = h.bounds("midi-note-visible").width
  h.root.renderer.nativeSimulateScrollWheel(
    grid.x + grid.width / 2,
    grid.y + grid.height / 2,
    0,
    120,
    "cmd"
  )
  const zoomed = h.bounds("midi-note-visible").width
  expect(zoomed / original).toBeCloseTo(3, 1)
  h.root.renderer.nativeSimulateScrollWheel(
    grid.x + grid.width / 2,
    grid.y + grid.height / 2,
    0,
    120,
    "cmd"
  )
  expect(h.bounds("midi-note-visible").width).toBeCloseTo(zoomed, 1)
})

test("MIDI loop editing consumes its own step without changing audio musical marker resolution", () => {
  owner.setPreference("midi", {
    ...owner.getPreference("midi"),
    noteGridBeats: 0.5,
    loopStepBars: 0.125,
  })
  const h = (view = mount())
  h.key("midi-loop-bars", "up")
  const midi = clipById(MIDI_ID)
  if (midi.kind !== "midi") throw new Error("Expected MIDI clip")
  expect(midi.loopBars).toBe(1.125)
  h.render(AUDIO_ID)
  h.key("audio-marker-start", "right")
  const audio = clipById(AUDIO_ID)
  if (audio.kind !== "audio") throw new Error("Expected audio clip")
  expect(getAudioClipSettings(audio, 120).startMarkerBars).toBe(0.0625)
})
