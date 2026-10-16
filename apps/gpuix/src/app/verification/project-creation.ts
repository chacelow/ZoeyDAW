import { configureProjectCreation, setProjectStorageId } from "@/project/adapters"
import { TEST_TRACK_APPEARANCE } from "@/project/adapters/fixtures"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import { getCreationNames } from "../i18n/creation-names"
import type { SupportedLocale } from "../i18n"

/** Standalone verification roots own an isolated authored project, not a route or user snapshot. */
export function initializeVerificationProject(
  projectId: string,
  locale: SupportedLocale = "en-US"
) {
  const release = configureProjectCreation({
    names: () => getCreationNames(locale),
    appearance: () => TEST_TRACK_APPEARANCE,
    preferences: () => PREFERENCE_DEFAULTS,
  })
  setProjectStorageId(projectId)
  return release
}
