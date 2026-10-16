import { creationNamesByLocale } from "../locales/creation-names"
import type { CreationNames } from "@/project/defaults/template"
import type { SupportedLocale } from "@/platform/i18n/core"

export type { CreationNames } from "@/project/defaults/template"

export function getCreationNames(
  locale: SupportedLocale,
  source = creationNamesByLocale[locale]
): CreationNames {
  return {
    get project() {
      return source.project
    },
    get main() {
      return source.main
    },
    get marker() {
      return source.marker
    },
    track: (kind, count) => source.track[kind].replaceAll("{{count}}", () => String(count)),
    copy: name => source.copy.replaceAll("{{name}}", () => name),
    clip: kind => source.clip[kind],
  }
}
