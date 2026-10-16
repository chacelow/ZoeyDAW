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
