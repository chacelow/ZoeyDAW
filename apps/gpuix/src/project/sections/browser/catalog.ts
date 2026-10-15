export type BrowserCategory =
  | "sounds"
  | "drums"
  | "instruments"
  | "audioEffects"
  | "midiEffects"
  | "modulators"
  | "max"
  | "plugins"
  | "clips"
  | "samples"
  | "grooves"
  | "tunings"
  | "templates"

export type BrowserKind =
  "device" | "preset" | "sample" | "midi" | "clip" | "groove" | "tuning" | "template"
export type BrowserPlace = "packs" | "userLibrary" | "currentProject"
export type BrowserSource = "all" | "favorites" | "purple" | BrowserCategory | BrowserPlace

interface BrowserEntryBase {
  id: string
  name: string
  category: BrowserCategory
  place: BrowserPlace
  tags: readonly string[]
  purple: boolean
}

export type BrowserEntry = BrowserEntryBase &
  ({ kind: "device"; children: readonly BrowserEntry[] } | { kind: Exclude<BrowserKind, "device"> })

function device(
  category: BrowserCategory,
  name: string,
  tags: readonly string[],
  presets: readonly string[]
): BrowserEntry {
  const id = `${category}-${name.toLowerCase().replaceAll(" ", "-")}`
  return {
    id,
    name,
    category,
    kind: "device",
    place: "packs",
    tags,
    purple: name === "Wavetable",
    children: presets.map((preset, index) => ({
      id: `${id}-${index}`,
      name: preset,
      category,
      kind: "preset",
      place: "userLibrary",
      tags,
      purple: preset.includes("Warm"),
    })),
  }
}

function resource(
  category: BrowserCategory,
  kind: Exclude<BrowserKind, "device">,
  name: string,
  tags: readonly string[],
  place: BrowserPlace = "packs"
): BrowserEntry {
  return {
    id: `${category}-${name}`,
    name,
    category,
    kind,
    tags,
    place,
    purple: tags.includes("Ambient"),
  }
}

export const BROWSER_ENTRIES: readonly BrowserEntry[] = [
  device("instruments", "Analog", ["Synth", "Analog"], ["Warm Pad", "Deep Bass", "Soft Keys"]),
  device("instruments", "Collision", ["Mallet", "Physical"], ["Glass Bells", "Marimba"]),
  device("instruments", "Drift", ["Synth", "Analog"], ["Slow Motion", "Warm Lead"]),
  device("instruments", "Electric", ["Keys", "Physical"], ["Classic EP", "Mellow Keys"]),
  device("instruments", "External Instrument", ["Utility"], []),
  device("instruments", "Impulse", ["Drums"], ["Studio Kit", "Electronic Kit"]),
  device("instruments", "Instrument Rack", ["Rack"], ["Layered Keys", "Ambient Texture"]),
  device("instruments", "Meld", ["Synth", "Digital"], ["Evolving Pad", "Metallic Pluck"]),
  device("instruments", "Operator", ["Synth", "FM"], ["FM Bass", "Crystal Keys"]),
  device("instruments", "Sampler", ["Sampler"], ["Grand Piano", "Tape Strings"]),
  device("instruments", "Simpler", ["Sampler"], ["One Shot", "Sliced Break"]),
  device("instruments", "Tension", ["Strings", "Physical"], ["Plucked String", "Bowed Texture"]),
  device(
    "instruments",
    "Wavetable",
    ["Synth", "Digital"],
    ["Warm Waves", "Moving Pad", "Sub Bass"]
  ),
  device("audioEffects", "Audio Effect Rack", ["Rack"], ["Master Chain", "Parallel Color"]),
  device("audioEffects", "Auto Filter", ["Filter"], ["Low Pass Sweep", "Envelope Filter"]),
  device("audioEffects", "Compressor", ["Dynamics"], ["Gentle Glue", "Punch"]),
  device("audioEffects", "Delay", ["Delay"], ["Dotted Echo", "Tape Slap"]),
  device("audioEffects", "EQ Eight", ["EQ"], ["Low Cut", "Air"]),
  device("audioEffects", "Glue Compressor", ["Dynamics"], ["Bus Glue", "Soft Clip"]),
  device("audioEffects", "Grain Delay", ["Delay", "Ambient"], ["Shimmer", "Frozen Grain"]),
  device("audioEffects", "Hybrid Reverb", ["Reverb", "Ambient"], ["Small Room", "Endless Hall"]),
  device("audioEffects", "Limiter", ["Dynamics"], ["Transparent", "Loud"]),
  device("audioEffects", "Saturator", ["Drive"], ["Warm Tape", "Soft Drive"]),
  device("audioEffects", "Utility", ["Utility"], ["Mono", "Wide"]),
  device("midiEffects", "Arpeggiator", ["MIDI"], ["Up & Down", "Random Steps"]),
  device("midiEffects", "Chord", ["MIDI"], ["Minor Seventh", "Fifth"]),
  device("midiEffects", "Scale", ["MIDI"], ["Minor", "Major"]),
  device("midiEffects", "Velocity", ["MIDI"], ["Soft Touch", "Accents"]),
  device("modulators", "LFO", ["Modulation"], ["Slow Sine", "Random Hold"]),
  device("modulators", "Shaper", ["Modulation"], ["Ramp", "Pulse"]),
  device("modulators", "Envelope Follower", ["Modulation"], ["Smooth", "Transient"]),
  device("max", "Max Instrument", ["Max for Live"], ["Granular Cloud", "Mono Synth"]),
  device("max", "Max Audio Effect", ["Max for Live"], ["Spectral Freeze", "Resonator"]),
  device("max", "Max MIDI Effect", ["Max for Live"], ["Melodic Steps", "Note Echo"]),
  device("plugins", "CLAP", ["Plug-in"], ["Demo Synth", "Demo Reverb"]),
  device("plugins", "VST3", ["Plug-in"], ["Demo Piano", "Demo Compressor"]),
  device("drums", "Drum Rack", ["Drums", "Rack"], ["808 Core Kit", "909 Core Kit", "Acoustic Kit"]),
  resource("sounds", "preset", "Ambient Keys", ["Keys", "Ambient"], "userLibrary"),
  resource("sounds", "preset", "Deep Sub", ["Bass", "Synth"]),
  resource("sounds", "preset", "Warm Strings", ["Strings", "Ambient"], "userLibrary"),
  resource("sounds", "preset", "Plucked Glass", ["Mallet", "Digital"]),
  resource("drums", "sample", "Kick 808.wav", ["Drums", "Kick"]),
  resource("drums", "sample", "Snare Dry.wav", ["Drums", "Snare"]),
  resource("drums", "sample", "Hi Hat Closed.wav", ["Drums", "Hi Hat"]),
  resource("samples", "sample", "Analog Texture.wav", ["Texture", "Ambient"], "userLibrary"),
  resource("samples", "sample", "Break 120 BPM.wav", ["Drums", "Loop"]),
  resource("samples", "sample", "Field Recording.wav", ["Texture", "Ambient"], "currentProject"),
  resource("samples", "sample", "Piano C3.wav", ["Keys", "One Shot"]),
  resource("clips", "clip", "Ambient Intro", ["Ambient", "Audio"], "currentProject"),
  resource("clips", "midi", "Bass Pattern.mid", ["Bass", "MIDI"], "currentProject"),
  resource("clips", "midi", "Chord Progression.mid", ["Keys", "MIDI"], "userLibrary"),
  resource("grooves", "groove", "Swing 16-55", ["Swing", "16th"]),
  resource("grooves", "groove", "Swing 8-60", ["Swing", "8th"]),
  resource("tunings", "tuning", "12-TET", ["Equal Temperament"]),
  resource("tunings", "tuning", "Just Intonation", ["Just Intonation"]),
  resource("templates", "template", "Empty Arrangement", ["Arrangement"], "userLibrary"),
  resource("templates", "template", "Electronic Session", ["Electronic"], "userLibrary"),
]

export const INITIAL_FAVORITES = [
  "instruments-wavetable",
  "audioEffects-hybrid-reverb",
  "drums-drum-rack",
]
