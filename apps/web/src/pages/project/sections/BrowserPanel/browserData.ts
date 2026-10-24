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

export type BrowserPlace = "packs" | "userLibrary" | "currentProject"
export type BrowserSource = "all" | "favorites" | "purple" | BrowserCategory | BrowserPlace
