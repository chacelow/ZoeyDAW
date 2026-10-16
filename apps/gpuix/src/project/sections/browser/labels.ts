import type { BrowserEntry, BrowserKind, BrowserSource } from "./catalog"
import type { DisplayFormats } from "@/project/model/display-formats"
import type { SupportedLocale } from "@/platform/i18n/core"

export interface BrowserLabels {
  readonly locale: SupportedLocale
  readonly formats: DisplayFormats
  readonly entries: readonly BrowserEntry[]
  readonly title: string
  readonly demonstration: string
  readonly back: string
  readonly forward: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly clearSearch: string
  readonly filters: string
  readonly content: string
  readonly name: string
  readonly results: string
  readonly resizeNavigation: string
  readonly expand: string
  readonly collapse: string
  readonly ascending: string
  readonly descending: string
  readonly empty: string
  readonly emptyHint: string
  readonly resetFilters: string
  readonly favorite: string
  readonly unfavorite: string
  readonly previewDisabled: string
  readonly groups: Readonly<Record<"collections" | "library" | "places", string>>
  readonly sources: Readonly<Record<BrowserSource, string>>
  readonly kinds: Readonly<Record<BrowserKind | "all", string>>
}
