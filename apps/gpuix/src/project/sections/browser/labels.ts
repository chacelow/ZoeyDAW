import type { BrowserKind, BrowserSource } from "./catalog"

export interface BrowserLabels {
  readonly title: string
  readonly demonstration: string
  readonly back: string
  readonly forward: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly clearSearch: string
  readonly filters: string
  readonly content: string
  readonly ascending: string
  readonly descending: string
  readonly empty: string
  readonly favorite: string
  readonly unfavorite: string
  readonly noSelection: string
  readonly previewDisabled: string
  readonly groups: Readonly<Record<"collections" | "library" | "places", string>>
  readonly sources: Readonly<Record<BrowserSource, string>>
  readonly kinds: Readonly<Record<BrowserKind | "all", string>>
}
