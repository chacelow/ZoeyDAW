import { expect, test } from "bun:test"
import { browserCatalogByLocale } from "@/app/locales/browser-catalog"
import type { BrowserEntry } from "./catalog"

const devicePresetCounts: Record<string, number> = {
  "instruments-analog": 3,
  "instruments-collision": 2,
  "instruments-drift": 2,
  "instruments-electric": 2,
  "instruments-external-instrument": 0,
  "instruments-impulse": 2,
  "instruments-instrument-rack": 2,
  "instruments-meld": 2,
  "instruments-operator": 2,
  "instruments-sampler": 2,
  "instruments-simpler": 2,
  "instruments-tension": 2,
  "instruments-wavetable": 3,
  "audioEffects-audio-effect-rack": 2,
  "audioEffects-auto-filter": 2,
  "audioEffects-compressor": 2,
  "audioEffects-delay": 2,
  "audioEffects-eq-eight": 2,
  "audioEffects-glue-compressor": 2,
  "audioEffects-grain-delay": 2,
  "audioEffects-hybrid-reverb": 2,
  "audioEffects-limiter": 2,
  "audioEffects-saturator": 2,
  "audioEffects-utility": 2,
  "midiEffects-arpeggiator": 2,
  "midiEffects-chord": 2,
  "midiEffects-scale": 2,
  "midiEffects-velocity": 2,
  "modulators-lfo": 2,
  "modulators-shaper": 2,
  "modulators-envelope-follower": 2,
  "max-max-instrument": 2,
  "max-max-audio-effect": 2,
  "max-max-midi-effect": 2,
  "plugins-clap": 2,
  "plugins-vst3": 2,
  "drums-drum-rack": 3,
}
const resourceIds = [
  "sounds-Ambient Keys",
  "sounds-Deep Sub",
  "sounds-Warm Strings",
  "sounds-Plucked Glass",
  "drums-Kick 808.wav",
  "drums-Snare Dry.wav",
  "drums-Hi Hat Closed.wav",
  "samples-Analog Texture.wav",
  "samples-Break 120 BPM.wav",
  "samples-Field Recording.wav",
  "samples-Piano C3.wav",
  "clips-Ambient Intro",
  "clips-Bass Pattern.mid",
  "clips-Chord Progression.mid",
  "grooves-Swing 16-55",
  "grooves-Swing 8-60",
  "tunings-12-TET",
  "tunings-Just Intonation",
  "templates-Empty Arrangement",
  "templates-Electronic Session",
]

function flatten(entries: readonly BrowserEntry[]): BrowserEntry[] {
  return entries.flatMap(entry => (entry.kind === "device" ? [entry, ...entry.children] : [entry]))
}

test("all 132 catalog identities preserve legacy IDs across locales and display translations", () => {
  const expected = [
    ...Object.entries(devicePresetCounts).flatMap(([id, count]) => [
      id,
      ...Array.from({ length: count }, (_, index) => `${id}-${index}`),
    ]),
    ...resourceIds,
  ].sort((left, right) => left.localeCompare(right))
  for (const locale of ["en-US", "zh-CN"] as const) {
    const entries = browserCatalogByLocale[locale]
    const all = flatten(entries)
    expect(entries.filter(entry => entry.kind === "device")).toHaveLength(37)
    expect(
      all.filter(entry => entry.kind === "preset" && !resourceIds.includes(entry.id))
    ).toHaveLength(75)
    expect(all).toHaveLength(132)
    expect(new Set(all.map(entry => entry.id)).size).toBe(132)
    expect(all.map(entry => entry.id).sort((left, right) => left.localeCompare(right))).toEqual(
      expected
    )
  }
})

test("localized catalog names and tags preserve brands and real resource basenames", () => {
  const english = flatten(browserCatalogByLocale["en-US"])
  const chinese = flatten(browserCatalogByLocale["zh-CN"])
  for (const original of english) {
    const translated = chinese.find(entry => entry.id === original.id)
    expect(translated).toBeDefined()
    if (
      /\.(wav|mid)$/.test(original.name) ||
      ["CLAP", "VST3", "Wavetable", "Max for Live"].includes(original.name)
    )
      expect(translated?.name).toBe(original.name)
    expect(translated?.purple).toBe(original.purple)
    expect(translated?.kind).toBe(original.kind)
    expect(translated?.place).toBe(original.place)
    expect(translated?.category).toBe(original.category)
  }
})

test("purple collection membership is explicit metadata rather than translated text matching", () => {
  const expected = [
    "instruments-wavetable",
    "instruments-analog-0",
    "instruments-drift-1",
    "instruments-wavetable-0",
    "audioEffects-saturator-0",
    "sounds-Ambient Keys",
    "sounds-Warm Strings",
    "samples-Analog Texture.wav",
    "samples-Field Recording.wav",
    "clips-Ambient Intro",
  ].sort((left, right) => left.localeCompare(right))
  for (const locale of ["en-US", "zh-CN"] as const)
    expect(
      flatten(browserCatalogByLocale[locale])
        .filter(entry => entry.purple)
        .map(entry => entry.id)
        .sort((left, right) => left.localeCompare(right))
    ).toEqual(expected)
})
